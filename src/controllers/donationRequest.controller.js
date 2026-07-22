import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { DonationRequest } from "../models/donationRequest.model.js";
import { BankProfile } from "../models/bankProfile.model.js"; // adjust path/casing if needed
import { getCoordinatesFromPincode } from "../utils/geocode.js";
import { sweepStaleTerminalRequests, NOT_DELETED } from "../utils/staleRequestCleanup.js";

// Configurable per-group minimum stock threshold — banks below this for the
// donor's exact blood group are considered "in need" and prioritized.
const MIN_STOCK_THRESHOLD = {
  "A+": 10, "A-": 5, "B+": 10, "B-": 5,
  "O+": 15, "O-": 5, "AB+": 5, "AB-": 5,
};

// Widening search radius stages, in meters. null = unbounded (last resort).
const RADIUS_STAGES_METERS = [50000, 100000, 250000, 500000, 1000000, null];

// How long a bank has to respond to an assignment before it's treated as a
// non-response and the request moves on without them. Kept generous since
// this is a lazy (on-access) check, not a proactive cron — see note above
// resolveExpiredAssignments.
const ASSIGNMENT_RESPONSE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// Overall safety net: no matter how much widening/re-broadcasting has
// happened, if 48 hours have passed since the request was created with
// still nobody accepting, stop trying to find a "better" match and just
// force-accept the nearest bank still pending from the current round.
const AUTO_RESOLVE_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48 hours

// Same fallback also fires early — even before the 48hr mark — once the
// donor's scheduled availability date is this close (or has already
// passed), so the donor isn't left without a bank on the day they can
// actually show up.
const AVAILABILITY_BUFFER_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cap how many banks get broadcast a single donation at once — keeps the
// assignments array bounded and avoids a donor's request fanning out to an
// unreasonable number of banks in one go.
const BROADCAST_LIMIT = 10;

// Core routing: find banks to route a donation to.
//
// Priority order:
//   1. Banks that are actually short on this blood group (inventory below
//      threshold), within the nearest radius stage that has ANY such bank.
//      ALL qualifying banks at that stage are returned — the caller
//      broadcasts to every one of them simultaneously.
//   2. If no bank anywhere is short on this group, fall back to the single
//      nearest approved bank overall — no broadcast needed, since donating
//      there is just "topping up" rather than filling urgent need.
//
// Radius widens in stages (50km -> 100km -> 200km -> unbounded) so nearby
// banks get first shot, but a donor is never stranded just because no bank
// within 50km happens to be short right now.
const findBanksForDonation = async ({
  latitude,
  longitude,
  bloodGroup,
  excludeBankIds = [],
}) => {
  if (latitude == null || longitude == null) return { banks: [], mode: "none" };

  const threshold = MIN_STOCK_THRESHOLD[bloodGroup] ?? 10;

  const baseQuery = {
    isApproved: true,
    userId: { $nin: excludeBankIds },
  };

  // Pass 1: needy banks, widening radius until we find at least one
  for (const maxDistance of RADIUS_STAGES_METERS) {
    const geoNearStage = {
      near: { type: "Point", coordinates: [longitude, latitude] },
      distanceField: "distance",
      spherical: true,
      query: {
        ...baseQuery,
        [`inventory.${bloodGroup}`]: { $lt: threshold },
      },
    };
    if (maxDistance != null) geoNearStage.maxDistance = maxDistance;

    const needResults = await BankProfile.aggregate([
      { $geoNear: geoNearStage },
      { $limit: BROADCAST_LIMIT },
    ]);

    if (needResults.length > 0) {
      return { banks: needResults, mode: "broadcast" };
    }
  }

  // Pass 2: no bank anywhere is short on this group — donation is still
  // useful, just not urgent. Assign the single nearest approved bank.
  for (const maxDistance of RADIUS_STAGES_METERS) {
    const geoNearStage = {
      near: { type: "Point", coordinates: [longitude, latitude] },
      distanceField: "distance",
      spherical: true,
      query: baseQuery,
    };
    if (maxDistance != null) geoNearStage.maxDistance = maxDistance;

    const singleResult = await BankProfile.aggregate([
      { $geoNear: geoNearStage },
      { $limit: 1 },
    ]);

    if (singleResult.length > 0) {
      return { banks: singleResult, mode: "single" };
    }
  }

  return { banks: [], mode: "none" };
};

// Pushes assignment entries onto a request for the given bank profiles and
// sets request.status accordingly. Shared by creation and re-routing after
// a rejection, so both paths behave identically.
const applyRouting = (request, { banks }) => {
  const expiresAt = new Date(Date.now() + ASSIGNMENT_RESPONSE_WINDOW_MS);

  for (const bankProfile of banks) {
    request.assignments.push({
      bank: bankProfile.userId, // User._id — keeps auth matching (req.user._id) unchanged
      bankName: bankProfile.bloodBankName,
      status: "assigned",
      expiresAt,
    });
  }
  request.status = banks.length > 0 ? "assigned" : "rejected";
};

// Lazy expiry check — call this before reading "is anything still pending"
// anywhere in the flow. Marks any "assigned" assignment whose response
// window has passed as "expired", in-memory on the given document (caller
// is responsible for save()-ing afterward if anything changed).
//
// LIMITATION: this only runs when someone touches the request (accept,
// reject, or a bank/donor fetching it) — a request nobody looks at won't
// self-expire and re-route on its own. For a fully proactive version, a
// scheduled job (node-cron / BullMQ) sweeping for expired assignments
// independent of user action is the next step; this lazy version is Phase 2
// as scoped — good enough to unblock a stuck request the moment anyone
// interacts with it, not a replacement for a real background sweep.
const expireStaleAssignments = (request) => {
  const now = new Date();
  let changed = false;

  for (const assignment of request.assignments) {
    if (assignment.status === "assigned" && assignment.expiresAt && assignment.expiresAt < now) {
      assignment.status = "expired";
      assignment.expiredAt = now;
      changed = true;
    }
  }

  return changed;
};

// Shared by rejectDonationRequest and getDonationRequestDetails: if nothing
// is actively pending anymore (everyone assigned so far has rejected or
// expired) and the donor hasn't cancelled and the request isn't already
// resolved, start a fresh broadcast round excluding everyone already tried.
// Mutates `request` in place; caller is responsible for save()-ing.
const tryWidenIfNothingActive = async (request) => {
  const stillPending = request.assignments.some((a) => a.status === "assigned");
  const donorStillWantsRouting = !["cancellation_requested", "cancelled"].includes(request.status);
  const notYetResolved = !["accepted", "fulfilled"].includes(request.status);

  if (stillPending || !donorStillWantsRouting || !notYetResolved) return;

  const excludeBankIds = request.assignments.map((a) => a.bank);

  const routing = await findBanksForDonation({
    latitude: request.latitude,
    longitude: request.longitude,
    bloodGroup: request.bloodGroup,
    excludeBankIds,
  });

  applyRouting(request, routing);
};

// Lazy safety net — no cron, checked opportunistically whenever a request
// is touched (reject, or donor viewing details). If either the 48hr overall
// timeout has elapsed since creation, or the donor's availability date is
// within (or past) the buffer window, and the request is still just sitting
// at "assigned" with nobody having accepted, force-accept the nearest still
// -pending bank from the current round rather than let the donor be stuck
// waiting on a response that may never come.
//
// "Nearest" = first entry among currently-pending assignments, since each
// broadcast round is pushed in $geoNear (distance-sorted) order.
//
// Returns true if it resolved something (caller should save()).
const tryAutoResolveToNearest = (request) => {
  if (request.status !== "assigned") return false;

  const now = Date.now();
  const timeSinceCreated = now - request.createdAt.getTime();
  const availabilityImminent =
    request.availability && request.availability.getTime() - now <= AVAILABILITY_BUFFER_MS;

  if (timeSinceCreated < AUTO_RESOLVE_TIMEOUT_MS && !availabilityImminent) {
    return false; // not stale enough yet, let normal routing keep trying
  }

  const pending = request.assignments.filter((a) => a.status === "assigned");
  if (pending.length === 0) return false; // nothing currently pending to fall back to

  const [chosen, ...rest] = pending;

  chosen.status = "accepted";
  chosen.acceptedAt = new Date(now);
  chosen.autoAssigned = true;

  for (const other of rest) {
    other.status = "superseded";
    other.supersededAt = new Date(now);
  }

  request.status = "accepted";
  return true;
};

// POST /api/donation-requests — donor creates a request, then auto-routed
export const createDonationRequest = asyncHandler(async (req, res) => {
  const {
    bloodGroup,
    age,
    availability,
    location,
    address,
    permanentAddress,
    pincode,
    phoneNumber,
    notes,
  } = req.body;

  if (
    !bloodGroup ||
    !age ||
    !availability ||
    !location ||
    !address ||
    !permanentAddress ||
    !pincode ||
    !phoneNumber
  ) {
    throw new ApiError(400, "Required fields missing");
  }

  // geocode the donor's pincode server-side — client no longer sends lat/lon
  const { latitude, longitude } = await getCoordinatesFromPincode(pincode);

  const request = await DonationRequest.create({
    userId: req.user._id,
    username: req.user.username,

    bloodGroup,
    age,
    availability: new Date(availability),

    location,
    address,
    permanentAddress,

    pincode,
    latitude,
    longitude,

    phoneNumber,
    notes,
  });

  const routing = await findBanksForDonation({ latitude, longitude, bloodGroup });
  applyRouting(request, routing);
  // else: stays "pending" if routing found nothing — no approved bank exists at all
  if (routing.banks.length === 0) request.status = "pending";

  await request.save();

  return res
    .status(201)
    .json(new ApiResponse(201, request, "Donation request created"));
});

// GET /api/donation-requests/my — donor sees their own requests
export const getMyDonationRequests = asyncHandler(async (req, res) => {
  await sweepStaleTerminalRequests(DonationRequest);

  const requests = await DonationRequest.find({ userId: req.user._id, ...NOT_DELETED })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, requests, "Donation requests fetched"));
});

// GET /api/admin/donation-requests/:id — admin, read-only, any request
export const getDonationRequestDetailsForAdmin = asyncHandler(async (req, res) => {
  const request = await DonationRequest.findById(req.params.id)
    .populate("assignments.bank", "username email phone pincode")
    .lean();

  if (!request) throw new ApiError(404, "Donation request not found");

  return res.json(new ApiResponse(200, request, "Donation request details fetched"));
});

// GET /api/donation-requests — ADMIN, READ-ONLY MONITORING
// no mutation capability — matches the blood-request admin/bank separation
export const getAllDonationRequests = asyncHandler(async (req, res) => {
  await sweepStaleTerminalRequests(DonationRequest);

  const { status, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const filter = status && status !== "all" ? { status, ...NOT_DELETED } : { ...NOT_DELETED };

  const total = await DonationRequest.countDocuments(filter);
  const requests = await DonationRequest.find(filter)
    .populate("assignments.bank", "username email phone")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  return res.json(new ApiResponse(200, { requests, total }, "All donation requests fetched"));
});

// GET /api/donation-requests/:id — donor views full detail of their own request
export const getDonationRequestDetails = asyncHandler(async (req, res) => {
  // Not .lean() here — this is the one read path where we may need to
  // mutate + save (expiry sweep, possible re-routing) before responding.
  const request = await DonationRequest.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!request) throw new ApiError(404, "Donation request not found");

  // Check the 48hr/availability safety net first — this can fire even if
  // nothing has expired yet (e.g. availability date is now imminent).
  const autoResolved = tryAutoResolveToNearest(request);

  if (!autoResolved) {
    const expired = expireStaleAssignments(request);
    if (expired) await tryWidenIfNothingActive(request);
  }

  if (autoResolved || request.isModified()) {
    await request.save();
  }

  const populatedRequest = await DonationRequest.findById(request._id)
    .populate("assignments.bank", "username email phone pincode")
    .lean();

  return res.json(new ApiResponse(200, populatedRequest, "Donation request details fetched"));
});

// PATCH /api/donation-requests/:id/cancel — donor requests cancellation
export const requestDonationCancellation = asyncHandler(async (req, res) => {
  const { cancellationReason } = req.body;

  const request = await DonationRequest.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!request) throw new ApiError(404, "Donation request not found");

  if (!["pending", "assigned"].includes(request.status)) {
    throw new ApiError(400, "This donation request can no longer be cancelled");
  }

  request.status = "cancellation_requested";
  request.cancellationReason = cancellationReason;
  await request.save();

  return res.json(new ApiResponse(200, request, "Cancellation requested"));
});

// ────────────────────────────────────────────────────────────
// BLOOD BANK ACTIONS — mirrors bloodRequest.controller.js
// ────────────────────────────────────────────────────────────

// GET /api/bloodbanks/donations — bank's own assigned donation requests
export const getBankDonationRequests = asyncHandler(async (req, res) => {
  await sweepStaleTerminalRequests(DonationRequest);

  const requests = await DonationRequest.find({ "assignments.bank": req.user._id, ...NOT_DELETED })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, requests, "Bank donation requests fetched"));
});

// PATCH /api/bloodbanks/donations/:id/accept
export const acceptDonationRequest = asyncHandler(async (req, res) => {
  // Atomic "first one wins" accept: the filter only matches while the
  // request is still "assigned" AND this bank's own assignment is still
  // "assigned" — MongoDB resolves concurrent accepts from different banks
  // one at a time, so at most one of them can match and update. A second,
  // near-simultaneous accept from another bank simply finds no matching
  // document and gets the "no longer available" error below, instead of
  // both accepts racing through a read-modify-save cycle.
  const request = await DonationRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "assigned",
      assignments: {
        $elemMatch: { bank: req.user._id, status: "assigned" },
      },
    },
    {
      $set: {
        status: "accepted",
        "assignments.$[elem].status": "accepted",
        "assignments.$[elem].acceptedAt": new Date(),
      },
    },
    {
      arrayFilters: [{ "elem.bank": req.user._id, "elem.status": "assigned" }],
      new: true,
    }
  );

  if (!request) {
    throw new ApiError(
      400,
      "This donation request is no longer available — it may already be accepted, or not assigned to you"
    );
  }

  // This bank won. Every other bank still pending on this same broadcast
  // round gets auto-closed as "superseded" — they stop seeing it as
  // actionable, without it looking like they were rejected or that the
  // donor cancelled on them. Not itself atomic, but harmless if it races:
  // the accept above already guaranteed exactly one winner regardless.
  await DonationRequest.updateOne(
    { _id: request._id },
    {
      $set: {
        "assignments.$[other].status": "superseded",
        "assignments.$[other].supersededAt": new Date(),
      },
    },
    {
      arrayFilters: [{ "other.status": "assigned" }],
    }
  );

  const updatedRequest = await DonationRequest.findById(request._id);

  return res.json(new ApiResponse(200, updatedRequest, "Donation request accepted"));
});

// PATCH /api/bloodbanks/donations/:id/reject
export const rejectDonationRequest = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;

  const request = await DonationRequest.findOne({
    _id: req.params.id,
    "assignments.bank": req.user._id,
  });

  if (!request) throw new ApiError(404, "Donation request not found or not assigned to you");

  const assignment = request.assignments.find(
    (a) => a.bank.toString() === req.user._id.toString()
  );

  if (!assignment || !["assigned", "accepted"].includes(assignment.status)) {
    throw new ApiError(400, "This donation request cannot be rejected at its current stage");
  }

  assignment.status = "rejected";
  assignment.rejectedAt = new Date();
  assignment.rejectionReason = rejectionReason || "";

  // Sweep for any other assignment from this same broadcast round that's
  // gone past its response window — an unresponsive bank shouldn't be able
  // to block widening forever just because it never explicitly rejected.
  expireStaleAssignments(request);

  // Check the 48hr/availability safety net first — if it's time to stop
  // widening and just settle for the nearest still-pending bank, do that
  // instead of kicking off another broadcast round.
  const autoResolved = tryAutoResolveToNearest(request);

  if (!autoResolved) {
    await tryWidenIfNothingActive(request);
    // else: other assignments still pending — request.status stays "assigned"
  }

  await request.save();

  return res.json(new ApiResponse(200, request, "Donation request rejected"));
});

// PATCH /api/bloodbanks/donations/:id/fulfill
export const fulfillDonationRequest = asyncHandler(async (req, res) => {
  const request = await DonationRequest.findOne({
    _id: req.params.id,
    "assignments.bank": req.user._id,
  });

  if (!request) throw new ApiError(404, "Donation request not found or not assigned to you");

  const assignment = request.assignments.find(
    (a) => a.bank.toString() === req.user._id.toString()
  );

  if (!assignment || assignment.status !== "accepted") {
    throw new ApiError(400, "Only accepted donation requests can be fulfilled");
  }

  // Inventory read + write happens on BankProfile, not User.
  const bankProfile = await BankProfile.findOne({ userId: req.user._id });
  if (!bankProfile) throw new ApiError(404, "Bank profile not found");

  bankProfile.inventory[request.bloodGroup] =
    (bankProfile.inventory[request.bloodGroup] || 0) + 1;
  await bankProfile.save();

  assignment.status = "fulfilled";
  assignment.fulfilledAt = new Date();
  request.status = "fulfilled";

  await request.save();

  return res.json(new ApiResponse(200, request, "Donation request fulfilled"));
});