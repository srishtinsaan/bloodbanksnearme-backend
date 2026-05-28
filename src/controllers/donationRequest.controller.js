import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { DonationRequest } from "../models/donationRequest.model.js";

// POST /api/donation-requests — donor creates a request
export const createDonationRequest = asyncHandler(async (req, res) => {
  const { bloodGroup, units, availability, location, pincode, phoneNumber, notes } = req.body;

  if (!bloodGroup || !units || !location || !pincode || !phoneNumber) {
    throw new ApiError(400, "Required fields missing");
  }

  const request = await DonationRequest.create({
    userId: req.user._id,
    username: req.user.username,
    bloodGroup,
    units,
    availability,
    location,
    pincode,
    phoneNumber,
    notes
  });

  return res.status(201).json(new ApiResponse(201, request, "Donation request created"));
});

// GET /api/donation-requests/my — donor sees their own requests
export const getMyDonationRequests = asyncHandler(async (req, res) => {
  const requests = await DonationRequest.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, requests, "Donation requests fetched"));
});

// GET /api/donation-requests — admin sees all requests
export const getAllDonationRequests = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const filter = status && status !== "all" ? { status } : {};

  const total = await DonationRequest.countDocuments(filter);
  const requests = await DonationRequest.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  return res.json(new ApiResponse(200, { requests, total }, "All donation requests fetched"));
});

// PATCH /api/donation-requests/:id/status — admin updates status
export const updateDonationRequestStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!["pending", "confirmed", "cancelled"].includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const request = await DonationRequest.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );

  if (!request) throw new ApiError(404, "Donation request not found");

  return res.json(new ApiResponse(200, request, "Status updated"));
});

// PATCH /api/donation-requests/:id/cancel — donor requests cancellation
export const requestDonationCancellation = asyncHandler(async (req, res) => {
  const { cancellationReason } = req.body;

  const request = await DonationRequest.findOne({
    _id: req.params.id,
    userId: req.user._id
  });

  if (!request) throw new ApiError(404, "Donation request not found");

  if (request.status !== "pending") {
    throw new ApiError(400, "Only pending requests can be cancelled");
  }

  request.status = "cancellation_requested";
  request.cancellationReason = cancellationReason;
  await request.save();

  return res.json(new ApiResponse(200, request, "Cancellation requested"));
});