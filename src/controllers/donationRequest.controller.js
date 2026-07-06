import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { DonationRequest } from "../models/donationRequest.model.js";

import { User } from "../models/user.model.js";
import { haversineDistance } from "../utils/haversine.js";
import { MinHeap } from "../utils/minHeap.js";
import { getBankCoordinates, getCoordinatesFromPincode } from "../utils/geocode.js";

// Configurable per-group minimum stock threshold — banks below this for the
// donor's exact blood group are considered "in need" and prioritized.
const MIN_STOCK_THRESHOLD = {
  "A+": 10, "A-": 5, "B+": 10, "B-": 5,
  "O+": 15, "O-": 5, "AB+": 5, "AB-": 5,
};

// Donation routing: filter by need (inventory below threshold for the
// donor's exact group), fall back to all approved banks if none qualify,
// then rank purely by distance — no composite scoring.
const findNearestBankForDonation = async ({
  latitude,
  longitude,
  bloodGroup,
  excludeBankIds = [],
}) => {
  if (latitude == null || longitude == null) return null;

  const threshold = MIN_STOCK_THRESHOLD[bloodGroup] ?? 10;

  let candidateBanks = await User.find({
    role: "bloodbank",
    isApproved: true,
    _id: { $nin: excludeBankIds },
    [`inventory.${bloodGroup}`]: { $lt: threshold },
  });

  // Fallback: no bank is below threshold — donation is still useful,
  // so widen to all approved banks rather than rejecting the donor.
  if (candidateBanks.length === 0) {
    candidateBanks = await User.find({
      role: "bloodbank",
      isApproved: true,
      _id: { $nin: excludeBankIds },
    });
  }

  if (candidateBanks.length === 0) return null;

  const heap = new MinHeap();

  for (const bank of candidateBanks) {
    const coords = await getBankCoordinates(bank);
    if (!coords) continue;

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

  const assignedBank = await findNearestBankForDonation({
    latitude,
    longitude,
    bloodGroup,
  });

  if (assignedBank) {
    request.assignments.push({
      bank: assignedBank._id,
      bankName: assignedBank.username,
      status: "assigned",
    });
    request.status = "assigned";
  }
  // else: stays "pending" — no approved bank exists at all

  await request.save();

  return res
    .status(201)
    .json(new ApiResponse(201, request, "Donation request created"));
});

// GET /api/donation-requests/my — donor sees their own requests
export const getMyDonationRequests = asyncHandler(async (req, res) => {
  const requests = await DonationRequest.find({ userId: req.user._id })
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
  const { status, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const filter = status && status !== "all" ? { status } : {};

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
  const request = await DonationRequest.findOne({
    _id: req.params.id,
    userId: req.user._id,
  })
    .populate("assignments.bank", "username email phone pincode")
    .lean();

  if (!request) throw new ApiError(404, "Donation request not found");

  return res.json(new ApiResponse(200, request, "Donation request details fetched"));
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
  const requests = await DonationRequest.find({ "assignments.bank": req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, requests, "Bank donation requests fetched"));
});

// PATCH /api/bloodbanks/donations/:id/accept
export const acceptDonationRequest = asyncHandler(async (req, res) => {
  const request = await DonationRequest.findOne({
    _id: req.params.id,
    "assignments.bank": req.user._id,
  });

  if (!request) throw new ApiError(404, "Donation request not found or not assigned to you");

  const assignment = request.assignments.find(
    (a) => a.bank.toString() === req.user._id.toString()
  );

  if (!assignment || assignment.status !== "assigned") {
    throw new ApiError(400, "Only newly assigned donation requests can be accepted");
  }

  assignment.status = "accepted";
  assignment.acceptedAt = new Date();
  request.status = "accepted";

  await request.save();

  return res.json(new ApiResponse(200, request, "Donation request accepted"));
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

  const excludeBankIds = request.assignments.map((a) => a.bank);

  const nextBank = await findNearestBankForDonation({
    latitude: request.latitude,
    longitude: request.longitude,
    bloodGroup: request.bloodGroup,
    excludeBankIds,
  });

  if (nextBank) {
    request.assignments.push({
      bank: nextBank._id,
      bankName: nextBank.username,
      status: "assigned",
    });
    request.status = "assigned";
  } else {
    request.status = "rejected";
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

  const bank = await User.findById(req.user._id);
  bank.inventory[request.bloodGroup] = (bank.inventory[request.bloodGroup] || 0) + 1;
  await bank.save();

  assignment.status = "fulfilled";
  assignment.fulfilledAt = new Date();
  request.status = "fulfilled";

  await request.save();

  return res.json(new ApiResponse(200, request, "Donation request fulfilled"));
});