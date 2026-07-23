import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { BloodRequest } from "../models/bloodRequest.model.js";
import { BankProfile } from "../models/bankProfile.model.js"; // adjust path/casing if needed
import { getCoordinatesFromPincode } from "../utils/geocode.js";
import { sweepStaleTerminalRequests, NOT_DELETED } from "../utils/staleRequestCleanup.js";
import { sendNotification } from "../utils/notify.js";


// ────────────────────────────────────────────────────────────────────────
// MULTI-BANK ROUTING / SPLITTING ENGINE
//
// Goal: given a request's coordinates + blood type + units needed, find the
// cheapest way to cover it — a single bank if one has enough stock, or a
// pair of banks (size-2) if none does. Capped at size-2, no size-3.
//
// Design (per user's handwritten notes):
//   1. Fetch candidates within 50km via $geoNear (already sorted by distance).
//   2. Size-1: first candidate (in sorted order) whose stock alone covers
//      `units` — early exit, since sorted order guarantees it's nearest.
//   3. Size-2: K = min(n, 10). Generate all KC2 pairs from the top-K nearest
//      candidates, cost = distKm(A) + distKm(B) + SPLIT_PENALTY_KM. Track
//      the best pair via a running minimum (no need to store all pairs).
//   4. Compare best-single vs best-pair, return whichever costs less.
//   5. Fallback: if nothing at all qualifies within 50km, expand to 100km,
//      fetch only the genuinely-new banks (exclude ones already seen), merge
//      with the original sorted list. Re-check is incremental:
//        - size-1: only check the newly-added banks (old ones already failed)
//        - size-2: only evaluate new×old and new×new pairs — old×old pairs
//          are skipped since they were already evaluated in round 1 and are
//          known not to beat "nothing found" (i.e. known to fail too).
//   6. If still nothing within 100km, caller gets null — request stays
//      unassigned/pending for admin monitoring, same as today.
// ────────────────────────────────────────────────────────────────────────

const INITIAL_RADIUS_METERS = 50_000;
const EXPANDED_RADIUS_METERS = 100_000;
const MAX_PAIR_CANDIDATES = 10; // K cap for size-2 pair generation
const SPLIT_PENALTY_KM = 5; // extra "cost" for needing a second bank instead of one — tune as needed

const fetchCandidatesWithinRadius = async ({
  latitude,
  longitude,
  bloodType,
  excludeBankIds,
  maxDistance,
}) => {
  // Only banks with SOME stock of this blood type are worth considering at
  // all (a bank with 0 units can never contribute to either a single-bank
  // or a pair-bank plan), so we filter that at the DB level to keep the
  // candidate set small from the start.
  return BankProfile.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [longitude, latitude] },
        distanceField: "distanceMeters",
        spherical: true,
        maxDistance,
        query: {
          isApproved: true,
          userId: { $nin: excludeBankIds },
          [`inventory.${bloodType}`]: { $gt: 0 },
        },
      },
    },
  ]);
};

// candidates must be sorted by distanceMeters ascending (guaranteed by $geoNear)
const findBestSingle = (candidates, bloodType, units) => {
  const match = candidates.find((c) => (c.inventory?.[bloodType] || 0) >= units);
  if (!match) return null;

  return {
    cost: match.distanceMeters / 1000,
    plan: [{ profile: match, unitsAssigned: units }],
  };
};

const allPairIndices = (n) => {
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  }
  return pairs;
};

// Skips old×old pairs (i < oldCount && j < oldCount) — those were already
// evaluated in a previous round. Includes new×old and new×new.
const incrementalPairIndices = (n, oldCount) => {
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const bothOld = i < oldCount && j < oldCount;
      if (!bothOld) pairs.push([i, j]);
    }
  }
  return pairs;
};

const evaluatePairs = (topK, bloodType, units, indexPairs) => {
  let best = null;

  for (const [i, j] of indexPairs) {
    const a = topK[i];
    const b = topK[j];
    const stockA = a.inventory?.[bloodType] || 0;
    const stockB = b.inventory?.[bloodType] || 0;

    if (stockA + stockB < units) continue;

    // Fill as much as possible from the nearer bank first, remainder from
    // the second — topK is distance-sorted so `a` here is whichever of the
    // pair comes first in the sorted array, not necessarily globally nearer
    // than every other candidate, but it is nearer than `b` within this pair.
    const unitsFromA = Math.min(stockA, units);
    const unitsFromB = units - unitsFromA;

    const cost = a.distanceMeters / 1000 + b.distanceMeters / 1000 + SPLIT_PENALTY_KM;

    if (!best || cost < best.cost) {
      best = {
        cost,
        plan: [
          { profile: a, unitsAssigned: unitsFromA },
          { profile: b, unitsAssigned: unitsFromB },
        ],
      };
    }
  }

  return best;
};

// Runs size-1 + size-2 for one round of candidates. `oldCount` (when > 0)
// restricts pair generation to new×old/new×new only, skipping old×old.
const routeSingleRound = ({ candidates, bloodType, units, oldCount = 0 }) => {
  const K = Math.min(candidates.length, MAX_PAIR_CANDIDATES);
  const topK = candidates.slice(0, K);

  const single = findBestSingle(candidates, bloodType, units);

  const indexPairs =
    oldCount > 0
      ? incrementalPairIndices(topK.length, Math.min(oldCount, K))
      : allPairIndices(topK.length);

  const pair = evaluatePairs(topK, bloodType, units, indexPairs);

  const options = [single, pair].filter(Boolean);
  if (options.length === 0) return null;

  return options.reduce((best, curr) => (curr.cost < best.cost ? curr : best));
};

// Both inputs are individually distance-sorted ($geoNear guarantees this),
// so a simple two-pointer merge keeps the combined list sorted without a
// full re-sort.
const mergeSortedByDistance = (a, b) => {
  const merged = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    merged.push(a[i].distanceMeters <= b[j].distanceMeters ? a[i++] : b[j++]);
  }
  while (i < a.length) merged.push(a[i++]);
  while (j < b.length) merged.push(b[j++]);
  return merged;
};

// Top-level entry point. Returns { cost, plan: [{ profile, unitsAssigned }, ...] }
// or null if nothing qualifies even after expanding to 100km.
const findRoutingPlan = async ({ latitude, longitude, bloodType, units, excludeBankIds = [] }) => {
  if (latitude == null || longitude == null) return null;

  const initialCandidates = await fetchCandidatesWithinRadius({
    latitude,
    longitude,
    bloodType,
    excludeBankIds,
    maxDistance: INITIAL_RADIUS_METERS,
  });

  const roundOneBest = routeSingleRound({ candidates: initialCandidates, bloodType, units });
  if (roundOneBest) return roundOneBest;

  // Nothing within 50km covers it (neither alone nor paired). Expand to
  // 100km — exclude banks we've already fetched so this second call only
  // returns genuinely new candidates.
  const alreadySeenIds = initialCandidates.map((c) => c.userId);
  const expandedNewCandidates = await fetchCandidatesWithinRadius({
    latitude,
    longitude,
    bloodType,
    excludeBankIds: [...excludeBankIds, ...alreadySeenIds],
    maxDistance: EXPANDED_RADIUS_METERS,
  });

  if (expandedNewCandidates.length === 0) return null;

  const merged = mergeSortedByDistance(initialCandidates, expandedNewCandidates);

  return routeSingleRound({
    candidates: merged,
    bloodType,
    units,
    oldCount: initialCandidates.length,
  });
};

// ────────────────────────────────────────────────────────────────────────
// CONTROLLERS
// ────────────────────────────────────────────────────────────────────────

// POST /api/blood-requests — create + auto-route
export const createBloodRequest = asyncHandler(async (req, res) => {
  const {
    bloodType,
    units,
    urgency,
    reason,
    location,
    address,
    permanentAddress,
    pincode,
    phoneNumber,
    notes,
    targetBankName,
    targetBankPincode,
    isTargeted,
    patientName,
    relationToPatient,
    patientAge,
  } = req.body;

  if (
    !bloodType ||
    !units ||
    !reason ||
    !location ||
    !address ||
    !permanentAddress ||
    !pincode ||
    !phoneNumber
  ) {
    throw new ApiError(400, "Required fields missing");
  }

  if (!req.user.isEmailVerified) {
    throw new ApiError(403, "Please verify your email before requesting blood");
  }

  const resolvedRelation = relationToPatient || "self";
  const resolvedPatientName =
    resolvedRelation === "self" ? patientName || req.user.username : patientName;

  if (!resolvedPatientName) {
    throw new ApiError(400, "Patient name is required");
  }

  const { latitude, longitude } = await getCoordinatesFromPincode(pincode);

  const request = await BloodRequest.create({
    userId: req.user._id,
    username: req.user.username,
    patientName: resolvedPatientName,
    relationToPatient: resolvedRelation,
    patientAge: patientAge || null,
    bloodType,
    units,
    urgency,
    reason,
    location,
    address,
    permanentAddress,
    pincode,
    latitude,
    longitude,
    phoneNumber,
    notes,
    targetBankName: targetBankName || null,
    targetBankPincode: targetBankPincode || null,
    isTargeted: isTargeted || false,
  });

  let routingPlan = null;

  // targeted-bank attempt stays single-bank-only by design — splitting only
  // kicks in for the untargeted/nearest-available path
  if (isTargeted && targetBankName) {
    const targeted = await BankProfile.findOne({
      isApproved: true,
      bloodBankName: targetBankName, // NOTE: verify this is the correct field name on BankProfile
    });

    if (targeted && (targeted.inventory?.[bloodType] || 0) >= units) {
      routingPlan = {
        cost: 0,
        plan: [{ profile: targeted, unitsAssigned: units }],
      };
    }
  }

  if (!routingPlan) {
    routingPlan = await findRoutingPlan({ latitude, longitude, bloodType, units });
  }

  if (routingPlan) {
    for (const { profile, unitsAssigned } of routingPlan.plan) {
      request.assignments.push({
        bank: profile.userId, // User._id — keeps auth matching (req.user._id) unchanged
        bankName: profile.bloodBankName,
        unitsAssigned,
        status: "assigned",
      });

      // NOTE: type "BLOOD_REQUEST_ASSIGNED" assumed by parity with
      // donationRequest.controller.js's "DONATION_REQUEST_ASSIGNED" —
      // verify this exists in notification.model.js's enum before relying on it.
      await sendNotification({
        recipient: profile.userId,
        type: "BLOOD_REQUEST_ASSIGNED",
        title: "New blood request",
        message: `A ${bloodType} blood request (${unitsAssigned} unit${unitsAssigned > 1 ? "s" : ""}) has been routed to your bank.`,
        relatedRequest: request._id,
        relatedRequestModel: "BloodRequest",
      });
    }
    request.status = "assigned";
  } else {
    // No bank(s) currently cover it — request stays "pending", visible to
    // admin for monitoring. Let the requester know nothing was found yet,
    // same as donationRequest.controller.js does for its "no bank" case.
    await sendNotification({
      recipient: request.userId,
      type: "BLOOD_REQUEST_PENDING", // NOTE: assumed enum value — verify against notification.model.js
      title: "No blood bank available yet",
      message: `We couldn't find a blood bank with enough ${bloodType} stock nearby right now. Your request is pending and visible to admins.`,
      relatedRequest: request._id,
      relatedRequestModel: "BloodRequest",
    });
  }

  await request.save();

  return res
    .status(201)
    .json(new ApiResponse(201, request, "Blood request created"));
});

// GET /api/blood-requests/my — recipient's own requests
export const getMyBloodRequests = asyncHandler(async (req, res) => {
  await sweepStaleTerminalRequests(BloodRequest);
  const requests = await BloodRequest.find({ userId: req.user._id, ...NOT_DELETED })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, requests, "Requests fetched"));
});

// GET /api/blood-requests — ADMIN, READ-ONLY MONITORING
//
// CHANGED: each request now carries a `banksTriedCount` so the admin list
// view shows routing activity (e.g. "3 banks tried") without needing to
// open every request individually — full detail/timeline still lives in
// getBloodRequestDetailsForAdmin.
export const getAllBloodRequests = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

    const filter = status && status !== "all" ? { status, ...NOT_DELETED } : { ...NOT_DELETED };

  const total = await BloodRequest.countDocuments(filter);
  const rawRequests = await BloodRequest.find(filter)
    .populate("assignments.bank", "username email phone")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const requests = rawRequests.map((r) => ({
  ...r,
  banksTriedCount: (r.assignments || []).length,
}));

  return res.json(new ApiResponse(200, { requests, total }, "All requests fetched"));
});

// PATCH /api/blood-requests/:id/cancel — recipient: cancellation request
export const requestCancellation = asyncHandler(async (req, res) => {
  const { cancellationReason } = req.body;

  const request = await BloodRequest.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!request) throw new ApiError(404, "Request not found");
  if (!["pending", "assigned"].includes(request.status)) {
    throw new ApiError(400, "This request can no longer be cancelled");
  }

  request.status = "cancellation_requested";
  request.cancellationReason = cancellationReason;
  await request.save();

  return res.json(new ApiResponse(200, request, "Cancellation requested"));
});

// ────────────────────────────────────────────────────────────
// BLOOD BANK ACTIONS — scoped to requests with an assignment for this bank
// ────────────────────────────────────────────────────────────

// GET /api/bloodbanks/requests — bank's own assigned requests
export const getBankBloodRequests = asyncHandler(async (req, res) => {
  await sweepStaleTerminalRequests(BloodRequest);

  const requests = await BloodRequest.find({ "assignments.bank": req.user._id, ...NOT_DELETED })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, requests, "Bank requests fetched"));
});

// GET /api/bloodbanks/requests/:id — single request, scoped to this bank only
export const getBloodRequestDetailsForBank = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findOne({
    _id: req.params.id,
    "assignments.bank": req.user._id,
  }).lean();

  if (!request) throw new ApiError(404, "Request not found or not assigned to you");

  return res.json(new ApiResponse(200, request, "Request details fetched"));
});

// PATCH /api/bloodbanks/requests/:id/accept
export const acceptBloodRequest = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findOne({
    _id: req.params.id,
    "assignments.bank": req.user._id,
  });

  if (!request) throw new ApiError(404, "Request not found or not assigned to you");

  const assignment = request.assignments.find(
    (a) => a.bank.toString() === req.user._id.toString()
  );

  if (!assignment || assignment.status !== "assigned") {
    throw new ApiError(400, "Only newly assigned requests can be accepted");
  }

  assignment.status = "accepted";
  assignment.acceptedAt = new Date();

  // With splitting, request.status should reflect accepted only once ALL
  // live (non-rejected) assignments are accepted — otherwise it stays
  // "assigned" while other banks in the split still haven't responded.
  const liveAssignments = request.assignments.filter((a) => a.status !== "rejected");
  const allAccepted = liveAssignments.every((a) =>
    ["accepted", "fulfilled"].includes(a.status)
  );
  if (allAccepted) request.status = "accepted";

  await request.save();

  // Notify the requester every time ANY bank in the split accepts its
  // portion — not just when the whole request becomes fully accepted —
  // since with splitting a recipient may otherwise wait a long time to
  // hear anything if only the "fully accepted" moment triggered a notice.
  await sendNotification({
    recipient: request.userId,
    type: "BLOOD_REQUEST_ACCEPTED", // NOTE: assumed enum value — verify against notification.model.js
    title: "Blood request accepted",
    message: allAccepted
      ? `${assignment.bankName} accepted your request. All required units are now covered.`
      : `${assignment.bankName} accepted ${assignment.unitsAssigned} unit${assignment.unitsAssigned > 1 ? "s" : ""} of your request. Other banks are still confirming the rest.`,
    relatedRequest: request._id,
    relatedRequestModel: "BloodRequest",
  });

  return res.json(new ApiResponse(200, request, "Request accepted"));
});

// PATCH /api/bloodbanks/requests/:id/reject
export const rejectBloodRequest = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;

  const request = await BloodRequest.findOne({
    _id: req.params.id,
    "assignments.bank": req.user._id,
  });

  if (!request) throw new ApiError(404, "Request not found or not assigned to you");

  const assignment = request.assignments.find(
    (a) => a.bank.toString() === req.user._id.toString()
  );

  if (!assignment || !["assigned", "accepted"].includes(assignment.status)) {
    throw new ApiError(400, "This request cannot be rejected at its current stage");
  }

  const rejectedUnits = assignment.unitsAssigned;

  assignment.status = "rejected";
  assignment.rejectedAt = new Date();
  assignment.rejectionReason = rejectionReason || "";

  // Only re-source the units THIS bank was covering — not the whole
  // request — so an already-accepted partner bank in a split assignment
  // isn't disturbed. Exclude every bank already involved in this request
  // (any status) to avoid re-assigning the same bank twice.
  const excludeBankIds = request.assignments.map((a) => a.bank);

  const replacementPlan = await findRoutingPlan({
    latitude: request.latitude,
    longitude: request.longitude,
    bloodType: request.bloodType,
    units: rejectedUnits,
    excludeBankIds,
  });

  if (replacementPlan) {
    for (const { profile, unitsAssigned } of replacementPlan.plan) {
      request.assignments.push({
        bank: profile.userId,
        bankName: profile.bloodBankName,
        unitsAssigned,
        status: "assigned",
      });

      // Same "newly assigned" notice as createBloodRequest sends — this
      // bank is being routed to for the first time on this request.
      await sendNotification({
        recipient: profile.userId,
        type: "BLOOD_REQUEST_ASSIGNED",
        title: "New blood request",
        message: `A ${request.bloodType} blood request (${unitsAssigned} unit${unitsAssigned > 1 ? "s" : ""}) has been routed to your bank.`,
        relatedRequest: request._id,
        relatedRequestModel: "BloodRequest",
      });
    }
    request.status = "assigned";
  } else {
    // No replacement found for the rejected portion. If other live
    // assignments still exist (e.g. the other half of a split that's still
    // accepted/fulfilled), leave the request's overall status as-is so
    // that coverage isn't lost — only mark fully "rejected" if nothing
    // live remains at all.
    const stillLive = request.assignments.some((a) =>
      ["assigned", "accepted", "fulfilled"].includes(a.status)
    );
    if (!stillLive) {
      request.status = "rejected";

      // Mirrors donationRequest.controller.js's applyRouting "banks.length
      // === 0" case — only fires when truly nothing is covering the
      // request anymore, not on every individual rejection within a split.
      await sendNotification({
        recipient: request.userId,
        type: "BLOOD_REQUEST_REJECTED", // NOTE: assumed enum value — verify against notification.model.js
        title: "No blood bank available",
        message: "We couldn't find another blood bank for your request right now.",
        relatedRequest: request._id,
        relatedRequestModel: "BloodRequest",
      });
    }
  }

  await request.save();

  return res.json(new ApiResponse(200, request, "Request rejected"));
});

// GET /api/admin/blood-requests/:id — admin, read-only, any request
//
// CHANGED: now surfaces the full routing flow — assignments are never
// deleted (a rejection just mutates that entry's status, a re-route pushes
// a new entry), so the array already holds the complete history of every
// bank this request was ever routed to. This just sorts it chronologically
// and adds a summary so the admin UI doesn't have to compute it client-side.
export const getBloodRequestDetailsForAdmin = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id)
    .populate("assignments.bank", "username email phone pincode")
    .lean();

  if (!request) throw new ApiError(404, "Blood request not found");

  const timeline = [...(request.assignments || [])].sort(
  (a, b) => new Date(a.assignedAt) - new Date(b.assignedAt)
);

  const routingSummary = {
    totalBanksTried: timeline.length,
    statusBreakdown: timeline.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {}),
  };

  return res.json(
    new ApiResponse(
      200,
      { ...request, assignments: timeline, routingSummary },
      "Blood request details fetched"
    )
  );
});

// PATCH /api/bloodbanks/requests/:id/fulfill
export const fulfillBloodRequest = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findOne({
    _id: req.params.id,
    "assignments.bank": req.user._id,
  });

  if (!request) throw new ApiError(404, "Request not found or not assigned to you");

  const assignment = request.assignments.find(
    (a) => a.bank.toString() === req.user._id.toString()
  );

  if (!assignment || assignment.status !== "accepted") {
    throw new ApiError(400, "Only accepted requests can be fulfilled");
  }

  const bankProfile = await BankProfile.findOne({ userId: req.user._id });
  if (!bankProfile) throw new ApiError(404, "Bank profile not found");

  const currentStock = bankProfile.inventory?.[request.bloodType] || 0;

  if (currentStock < assignment.unitsAssigned) {
    throw new ApiError(400, "Insufficient inventory to fulfill this request");
  }

  bankProfile.inventory[request.bloodType] = currentStock - assignment.unitsAssigned;
  await bankProfile.save();

  assignment.status = "fulfilled";
  assignment.fulfilledAt = new Date();

  // Sum units across ALL fulfilled assignments — now genuinely exercised by
  // split (size-2) assignments, not just a pass-through for the single-bank
  // case.
  const totalFulfilledUnits = request.assignments
    .filter((a) => a.status === "fulfilled")
    .reduce((sum, a) => sum + a.unitsAssigned, 0);

  if (totalFulfilledUnits >= request.units) {
    request.status = "fulfilled";
  } else {
    request.status = "partially_fulfilled";
  }

  await request.save();

  // Notify the requester per-bank-fulfillment, same reasoning as
  // acceptBloodRequest — with splitting, each bank's fulfillment is its
  // own event worth reporting, not just the final "fully fulfilled" one.
  await sendNotification({
    recipient: request.userId,
    type: "BLOOD_REQUEST_FULFILLED", // NOTE: assumed enum value — verify against notification.model.js
    title: request.status === "fulfilled" ? "Blood request fulfilled" : "Partial fulfillment",
    message:
      request.status === "fulfilled"
        ? `${assignment.bankName} fulfilled ${assignment.unitsAssigned} unit${assignment.unitsAssigned > 1 ? "s" : ""}. Your request is now fully covered.`
        : `${assignment.bankName} fulfilled ${assignment.unitsAssigned} unit${assignment.unitsAssigned > 1 ? "s" : ""}. Waiting on the remaining portion from another bank.`,
    relatedRequest: request._id,
    relatedRequestModel: "BloodRequest",
  });

  return res.json(new ApiResponse(200, request, "Request fulfilled"));
});