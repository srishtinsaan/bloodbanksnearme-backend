import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { BloodRequest } from "../models/bloodRequest.model.js";
import { User } from "../models/user.model.js";
import { haversineDistance } from "../utils/haversine.js";
import { MinHeap } from "../utils/minHeap.js";
import { getBankCoordinates, getCoordinatesFromPincode } from "../utils/geocode.js";

// Core routing logic: given a request's coordinates + blood type + units needed,
// find the nearest verified bank that ALREADY has enough stock.
// Stock is filtered at the query level, so the heap only ever ranks valid candidates
// — the first pop is always the answer, no "pop until stock found" loop needed.
// excludeBankIds lets us skip banks that already rejected this request.
const findNearestAvailableBank = async ({
  latitude,
  longitude,
  bloodType,
  units,
  excludeBankIds = [],
}) => {
  if (latitude == null || longitude == null) return null;

  const candidateBanks = await User.find({
    role: "bloodbank",
    isApproved: true,
    _id: { $nin: excludeBankIds },
    [`inventory.${bloodType}`]: { $gte: units },
  });

  if (candidateBanks.length === 0) return null;

  const heap = new MinHeap();

  for (const bank of candidateBanks) {
    const coords = await getBankCoordinates(bank);
    if (!coords) continue; // skip banks we couldn't geocode

    const distance = haversineDistance(
      latitude,
      longitude,
      coords.latitude,
      coords.longitude
    );
    heap.push(distance, bank);
  }

  if (heap.isEmpty()) return null;

  const { data: nearestBank } = heap.pop();
  return nearestBank;
};

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

  // geocode the request's own pincode — this is what actually drives distance
  // calculations, so it has to happen at creation time, not left to the client
  const { latitude, longitude } = await getCoordinatesFromPincode(pincode);

  const request = await BloodRequest.create({
    userId: req.user._id,
    username: req.user.username,
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

  let assignedBank = null;

  // if the recipient targeted a specific bank, try that one first
  if (isTargeted && targetBankName) {
    const targeted = await User.findOne({
      role: "bloodbank",
      isApproved: true,
      username: targetBankName,
    });

    if (targeted && (targeted.inventory?.[bloodType] || 0) >= units) {
      assignedBank = targeted;
    }
  }

  // otherwise (or if targeted bank lacks stock), fall back to nearest-available search
  if (!assignedBank) {
    assignedBank = await findNearestAvailableBank({
      latitude,
      longitude,
      bloodType,
      units,
    });
  }

  if (assignedBank) {
    request.assignments.push({
      bank: assignedBank._id,
      bankName: assignedBank.username,
      unitsAssigned: units,
      status: "assigned",
    });
    request.status = "assigned";
  }
  // else: request stays "pending" — no bank currently has stock, visible to admin for monitoring

  await request.save();

  return res
    .status(201)
    .json(new ApiResponse(201, request, "Blood request created"));
});

// GET /api/blood-requests/my — recipient's own requests
export const getMyBloodRequests = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, requests, "Requests fetched"));
});

// GET /api/blood-requests — ADMIN, READ-ONLY MONITORING
// no mutation capability lives here anymore
export const getAllBloodRequests = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const filter = status && status !== "all" ? { status } : {};

  const total = await BloodRequest.countDocuments(filter);
  const requests = await BloodRequest.find(filter)
    .populate("assignments.bank", "username email phone")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

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
  const requests = await BloodRequest.find({ "assignments.bank": req.user._id })
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
  request.status = "accepted";

  await request.save();

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

  assignment.status = "rejected";
  assignment.rejectedAt = new Date();
  assignment.rejectionReason = rejectionReason || "";

  // try to re-route to the next-nearest bank, excluding every bank that's
  // already been assigned to this request (not just the one that just rejected)
  const excludeBankIds = request.assignments.map((a) => a.bank);

  const nextBank = await findNearestAvailableBank({
    latitude: request.latitude,
    longitude: request.longitude,
    bloodType: request.bloodType,
    units: request.units,
    excludeBankIds,
  });

  if (nextBank) {
    request.assignments.push({
      bank: nextBank._id,
      bankName: nextBank.username,
      unitsAssigned: request.units,
      status: "assigned",
    });
    request.status = "assigned";
  } else {
    // no other bank available — request has no live assignment, admin monitors it
    request.status = "rejected";
  }

  await request.save();

  return res.json(new ApiResponse(200, request, "Request rejected"));
});

// GET /api/admin/blood-requests/:id — admin, read-only, any request
export const getBloodRequestDetailsForAdmin = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id)
    .populate("assignments.bank", "username email phone pincode")
    .lean();

  if (!request) throw new ApiError(404, "Blood request not found");

  return res.json(new ApiResponse(200, request, "Blood request details fetched"));
});

// PATCH /api/bloodbanks/requests/:id/fulfill
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

  const bank = await User.findById(req.user._id);
  const currentStock = bank.inventory?.[request.bloodType] || 0;

  if (currentStock < assignment.unitsAssigned) {
    throw new ApiError(400, "Insufficient inventory to fulfill this request");
  }

  bank.inventory[request.bloodType] = currentStock - assignment.unitsAssigned;
  await bank.save();

  assignment.status = "fulfilled";
  assignment.fulfilledAt = new Date();

  // Sum units across ALL fulfilled assignments, not just this one — with
  // splitting disabled there's only ever one assignment, so this collapses
  // to the same value as assignment.unitsAssigned. Once splitting is turned
  // on, this same loop correctly handles multiple banks each fulfilling
  // part of the request, with no further changes needed here.
  const totalFulfilledUnits = request.assignments
    .filter((a) => a.status === "fulfilled")
    .reduce((sum, a) => sum + a.unitsAssigned, 0);

  if (totalFulfilledUnits >= request.units) {
    request.status = "fulfilled";
  } else {
    // Partial coverage — only reachable once splitting is enabled, since
    // right now a single assignment's unitsAssigned always equals request.units.
    request.status = "partially_fulfilled";
  }

  await request.save();

  return res.json(new ApiResponse(200, request, "Request fulfilled"));
});