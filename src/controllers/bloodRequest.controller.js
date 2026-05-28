import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { BloodRequest } from "../models/bloodRequest.model.js";

// POST /api/blood-requests — create
export const createBloodRequest = asyncHandler(async (req, res) => {
  const { bloodType, units, urgency, reason, location, pincode, phoneNumber, notes, targetBankName, targetBankPincode, isTargeted } = req.body;

  if (!bloodType || !units || !reason || !location || !pincode || !phoneNumber) {
    throw new ApiError(400, "Required fields missing");
  }

  const request = await BloodRequest.create({
    userId: req.user._id,
    username: req.user.username,
    bloodType,
    units,
    urgency,
    reason,
    location,
    pincode,
    phoneNumber,
    notes,
    targetBankName: targetBankName || null,
    targetBankPincode: targetBankPincode || null,
    isTargeted: isTargeted || false
  });

  return res.status(201).json(new ApiResponse(201, request, "Blood request created"));
});

// GET /api/blood-requests/my — current user ki requests
export const getMyBloodRequests = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, requests, "Requests fetched"));
});

// GET /api/blood-requests — admin: sab requests
export const getAllBloodRequests = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const filter = status && status !== "all" ? { status } : {};

  const total = await BloodRequest.countDocuments(filter);
  const requests = await BloodRequest.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  return res.json(new ApiResponse(200, { requests, total }, "All requests fetched"));
});

// PATCH /api/blood-requests/:id/status — admin: status update
export const updateBloodRequestStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!["pending", "fulfilled", "cancelled"].includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const request = await BloodRequest.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );

  if (!request) throw new ApiError(404, "Request not found");

  return res.json(new ApiResponse(200, request, "Status updated"));
});

// PATCH /api/blood-requests/:id/cancel — user: cancellation request
export const requestCancellation = asyncHandler(async (req, res) => {
  const { cancellationReason } = req.body;

  

  const request = await BloodRequest.findOne({
    _id: req.params.id,
    userId: req.user._id  // sirf apni request cancel kar sakta hai
  });

  if (!request) throw new ApiError(404, "Request not found");
  if (request.status !== "pending") throw new ApiError(400, "Only pending requests can be cancelled");

  request.status = "cancellation_requested";
  request.cancellationReason = cancellationReason;
  await request.save();

  return res.json(new ApiResponse(200, request, "Cancellation requested"));
});

// GET /api/blood-requests/bank — bloodbank ki requests
export const getBankBloodRequests = asyncHandler(async (req, res) => {
  const bankName = req.user.username
  const bankPincode = req.user.pincode

  const requests = await BloodRequest.find({
    $or: [
      // specifically is bank ko targeted
      { targetBankName: bankName, isTargeted: true },
      // general requests same area mein
      { isTargeted: false, pincode: bankPincode }
    ]
  })
  .sort({ createdAt: -1 })
  .lean()

  return res.json(new ApiResponse(200, requests, "Bank requests fetched"))
})