import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { BloodRequest } from "../models/bloodRequest.model.js"; // ADD — adjust path/casing if your model file differs

// GET /api/v1/admin/users?role=donor&page=1&limit=10
export const getAllUsers = asyncHandler(async (req, res) => {
  const { role } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter = ["donor", "recipient"].includes(role)
    ? { role: "user", mode: role }
    : role
    ? { role }
    : {};

  const total = await User.countDocuments(filter);
  const verifiedTotal = await User.countDocuments({ ...filter, isApproved: true });

  const users = await User.find(filter)
    .select("-password -refreshToken")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return res.json(new ApiResponse(200, { users, total, verifiedTotal }, "Users fetched"));
});

// PATCH /api/v1/admin/users/:id/verify
export const verifyBank = asyncHandler(async (req, res) => {
  const { isApproved } = req.body;

  if (typeof isApproved !== "boolean") {
    throw new ApiError(400, "isApproved must be a boolean");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    { isApproved },
    { new: true }
  ).select("-password -refreshToken");

  if (!updatedUser) throw new ApiError(404, "User not found");

  return res.json(new ApiResponse(200, updatedUser, "User verification updated"));
});

// GET /api/v1/admin/stats
export const getStats = asyncHandler(async (req, res) => {
  const users = await User.countDocuments({ role: "user" });

  const totalBanks = await User.countDocuments({ role: "bloodbank" });
  const verifiedBanks = await User.countDocuments({ role: "bloodbank", isApproved: true });

  const pendingRequests = await BloodRequest.countDocuments({ status: "pending" });
  const assignedRequests = await BloodRequest.countDocuments({ status: "assigned" });
  const fulfilledRequests = await BloodRequest.countDocuments({ status: "fulfilled" });
  const rejectedRequests = await BloodRequest.countDocuments({ status: "rejected" });

  return res.json(
    new ApiResponse(
      200,
      {
        users,
        bloodBanks: {
          total: totalBanks,
          verified: verifiedBanks,
        },
        requests: {
          pending: pendingRequests,
          assigned: assignedRequests,
          fulfilled: fulfilledRequests,
          rejected: rejectedRequests,
        },
      },
      "Stats fetched"
    )
  );
});

// GET /api/v1/admin/blood-requests/:id — single request, full timeline
// (admin-scoped counterpart to getBloodRequestDetailsForBank, which is bank-scoped)
export const getBloodRequestDetailsForAdmin = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id)
    .populate("assignments.bank", "username email phone licenseNumber")
    .lean();

  if (!request) throw new ApiError(404, "Request not found");

  return res.json(new ApiResponse(200, request, "Request details fetched"));
});