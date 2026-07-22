import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { BankProfile } from "../models/bankProfile.model.js"; // adjust path/casing if needed
import { BloodRequest } from "../models/bloodRequest.model.js";
import { DonationRequest } from "../models/donationRequest.model.js";

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

  // isApproved no longer exists on User at all (admin approval for
  // donor/recipient accounts was removed — identity is verified via
  // isEmailVerified today, Aadhaar eKYC later; no admin gate for those roles).
  // Bloodbank accounts never verify by email at all — they're gated purely
  // by BankProfile.isApproved — so "verified" means something different
  // depending on role and has to be computed accordingly, not with a single
  // isEmailVerified count that would silently read as 0 for every bank.
  let verifiedTotal;
  if (filter.role === "bloodbank") {
    const approvedUserIds = await BankProfile.find({ isApproved: true }).distinct("userId");
    verifiedTotal = approvedUserIds.length;
  } else {
    verifiedTotal = await User.countDocuments({ ...filter, isEmailVerified: true });
  }

  const users = await User.find(filter)
    .select("-password -refreshToken")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return res.json(new ApiResponse(200, { users, total, verifiedTotal }, "Users fetched"));
});

// PATCH /api/v1/admin/users/:id/verify
// This endpoint is bloodbank-only. Donor/recipient accounts have no
// admin-controlled approval flag — nothing to verify here.
export const verifyBank = asyncHandler(async (req, res) => {
  const { isApproved } = req.body;

  if (typeof isApproved !== "boolean") {
    throw new ApiError(400, "isApproved must be a boolean");
  }

  const user = await User.findById(req.params.id).select("role username");
  if (!user) throw new ApiError(404, "User not found");
  if (user.role !== "bloodbank") {
    throw new ApiError(400, "This endpoint only verifies bloodbank accounts");
  }

  const updatedProfile = await BankProfile.findOneAndUpdate(
    { userId: user._id },
    { isApproved },
    { new: true }
  );

  if (!updatedProfile) throw new ApiError(404, "Bank profile not found for this user");

  return res.json(
    new ApiResponse(200, { user, bankProfile: updatedProfile }, "Bank verification updated")
  );
});

// GET /api/v1/admin/stats
export const getStats = asyncHandler(async (req, res) => {
  const users = await User.countDocuments({ role: "user" });

  const totalBanks = await User.countDocuments({ role: "bloodbank" });
  // verified-bank count comes from BankProfile, not User.
  const verifiedBanks = await BankProfile.countDocuments({ isApproved: true });

  const pendingRequests = await BloodRequest.countDocuments({ status: "pending" });
  const assignedRequests = await BloodRequest.countDocuments({ status: "assigned" });
  const fulfilledRequests = await BloodRequest.countDocuments({ status: "fulfilled" });
  const rejectedRequests = await BloodRequest.countDocuments({ status: "rejected" });

  const pendingDonations = await DonationRequest.countDocuments({ status: "pending" });
  const assignedDonations = await DonationRequest.countDocuments({ status: "assigned" });
  const acceptedDonations = await DonationRequest.countDocuments({ status: "accepted" });
  const fulfilledDonations = await DonationRequest.countDocuments({ status: "fulfilled" });
  const rejectedDonations = await DonationRequest.countDocuments({ status: "rejected" });

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
        donations: {
          pending: pendingDonations,
          assigned: assignedDonations,
          accepted: acceptedDonations,
          fulfilled: fulfilledDonations,
          rejected: rejectedDonations,
        },
      },
      "Stats fetched"
    )
  );
});

// NOTE: getBloodRequestDetailsForAdmin used to be defined here too, but
// admin.routes.js has always imported and used the version from
// bloodRequest.controller.js instead (which now also returns the
// chronological assignments timeline + routingSummary) — this file's copy
// was dead code, never actually reachable through any route, so it's been
// removed rather than kept in sync with two copies of the same logic.