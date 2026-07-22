import { BloodBanks } from "../models/bloodbanks.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { redis } from "../utils/redisClient.js";


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


// export const updateInventory = async (req, res) => {
//   const { bloodGroup, units } = req.body; // units = kitne badalne hain (jaise -1 ya +5)

//   const bloodBank = await BloodBanks.findOne({ userId: req.user._id });
//   if (!bloodBank) {
//     throw new ApiError(404, "Blood bank profile not found");
//   }

//   if (bloodBank.verificationStatus !== "verified") {
//     throw new ApiError(403, "Blood bank must be verified before updating inventory");
//   }

//   // ── FIX 1: Atomic update ──────────────────────────────────────
//   // Purana tareeka (galat): pehle padho (find), phir memory mein badlo, phir save karo.
//   // Iske beech mein doosri request bhi "purana" value padh sakti hai — race condition.
//   //
//   // Naya tareeka: MongoDB ko EK HI COMMAND mein bolo "check bhi karo, update bhi karo."
//   // MongoDB internally guarantee karta hai ki ye poora operation atomic hai —
//   // koi doosri request beech mein interfere nahi kar sakti.
//   const updateQuery = {
//     _id: bloodBank._id,
//   };

//   // Agar stock GHATANA hai (units negative hai, jaise -1), to condition lagao
//   // ki sirf tabhi update ho jab itna stock GENUINELY available ho.
//   if (units < 0) {
//     updateQuery[`inventory.${bloodGroup}`] = { $gte: Math.abs(units) };
//   }

//   const updatedBank = await BloodBanks.findOneAndUpdate(
//     updateQuery,
//     { $inc: { [`inventory.${bloodGroup}`]: units } },
//     { new: true } // updated document wapas do, purana nahi
//   );

//   // Agar updatedBank null aaya, matlab condition match hi nahi hui —
//   // stock already kisi aur request ne le liya tha (race condition wali
//   // situation, lekin ab safely handle ho gayi, corrupt data nahi bani)
//   if (!updatedBank) {
//     throw new ApiError(409, "Stock is no longer available at the requested quantity");
//   }

//   // ── FIX 2: Cache invalidation ─────────────────────────────────
//   // Ab jab inventory GENUINELY badal chuki hai DB mein, is bank ke
//   // pincode ka pehle se cached search-result PURANA (stale) ho chuka hai.
//   // Use turant hata do — taaki agli search fresh MongoDB se data laaye,
//   // 60 second wait na karna pade.
//   await redis.del(`search:${updatedBank.pincode}`);

//   return res.status(200).json(
//     new ApiResponse(200, { inventory: updatedBank.inventory }, "Inventory updated successfully")
//   );
// };

