import { BloodBanks } from "../models/bloodbanks.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const getPendingBloodBanks = asyncHandler(async (req, res) => {
  const banks = await BloodBanks.find({
    verificationStatus: "pending",
  }).sort({ createdAt: -1 });

  return res.json(
    new ApiResponse(200, banks, "Pending blood banks fetched")
  );
});

export const getVerifiedBloodBanks = asyncHandler(async (req, res) => {
  const banks = await BloodBanks.find({
    verificationStatus: "verified",
  }).sort({ bloodBankName: 1 });

  return res.json(
    new ApiResponse(200, banks, "Verified blood banks fetched")
  );
});

export const getBloodBankById = asyncHandler(async (req, res) => {
  const bank = await BloodBanks.findById(req.params.id);

  if (!bank) {
    throw new ApiError(404, "Blood bank not found");
  }

  return res.json(
    new ApiResponse(200, bank, "Blood bank fetched")
  );
});

export const approveBloodBank = asyncHandler(async (req, res) => {
  const bank = await BloodBanks.findById(req.params.id);

  if (!bank) {
    throw new ApiError(404, "Blood bank not found");
  }

  bank.isVerified = true;
  bank.verificationStatus = "verified";
  bank.verifiedAt = new Date();
  bank.verifiedBy = req.user._id;

  await bank.save();

  return res.json(
    new ApiResponse(200, bank, "Blood bank verified successfully")
  );
});

export const rejectBloodBank = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const bank = await BloodBanks.findById(req.params.id);

  if (!bank) {
    throw new ApiError(404, "Blood bank not found");
  }

  bank.isVerified = false;
  bank.verificationStatus = "rejected";
  bank.rejectionReason = reason || "";

  await bank.save();

  return res.json(
    new ApiResponse(200, bank, "Blood bank rejected")
  );
});

export const getBankBloodRequests = async (req, res) => {
  const bankId = req.user._id;

  const requests = await BloodRequest.find({
    assignedBankId: bankId
  }).sort({ createdAt: -1 });

  res.json(new ApiResponse(200, requests, "Bank requests fetched"));
};

export const updateBloodRequestStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowed = ["accepted", "rejected", "fulfilled", "closed"];

  if (!allowed.includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const request = await BloodRequest.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );

  res.json(new ApiResponse(200, request, "Status updated"));
};

