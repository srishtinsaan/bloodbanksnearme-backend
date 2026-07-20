import { Router } from "express";
import { fetchBloodBanksByPinCode } from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { loginUser, registerUser, logoutUser, refreshAccessToken, verifyEmailOTP, resendOTP } from "../controllers/auth.controller.js";
import { BloodBanks } from "../models/bloodbanks.model.js"; 
import { User } from "../models/user.model.js"; 
import {registerDonor} from "../controllers/donor.controller.js"
import {Donor} from "../models/donor.model.js"
import { authorizeRoles } from "../middlewares/authorizeRoles.js";
import { authorizeMode } from "../middlewares/authorizeMode.js";
import { ApiError } from "../utils/ApiError.js";
import {
  createBloodRequest,
  getMyBloodRequests,
  getAllBloodRequests,
  requestCancellation,
} from "../controllers/bloodRequest.controller.js";
import {
  createDonationRequest,
  getMyDonationRequests,
  getDonationRequestDetails,
  getAllDonationRequests,
  requestDonationCancellation
} from "../controllers/donationRequest.controller.js";

import { ApiResponse } from "../utils/ApiResponse.js";

const router = Router();

router.get("/test", (req, res) => {
  res.send("working");
});

router.route("/bloodbanks").post(fetchBloodBanksByPinCode)

console.log("bloodbanks route registered");

router.post("/auth/register", registerUser)

router.post("/auth/login", loginUser)

router.post("/auth/verify-email", verifyEmailOTP)

router.post("/auth/resend-otp", resendOTP)

// secured routes : those routes that are given to user only when she's logged in

// secured routes : those routes that are given to user only when she's logged in

router.route("/auth/logout").post(verifyJWT, logoutUser)

router.route("/auth/refresh-token").post(refreshAccessToken)


router.route("/dashboard/donor/register").post(verifyJWT, authorizeMode("donor"), registerDonor);

router.patch("/auth/set-mode", verifyJWT, async (req, res) => {
  const { mode } = req.body;

  if (!["donor", "recipient"].includes(mode)) {
    throw new ApiError(400, "Invalid mode. Must be donor or recipient");
  }

  if (req.user.role !== "user") {
    throw new ApiError(403, "Only users can set mode");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { mode },
    { new: true }
  ).select("-password -refreshToken");

  return res.json(new ApiResponse(200, { user: updatedUser, mode }, "Mode set successfully"));
});

// User routes
router.post("/blood-requests", verifyJWT, createBloodRequest);
router.get("/blood-requests/my", verifyJWT, getMyBloodRequests);
router.patch("/blood-requests/:id/cancel", verifyJWT, requestCancellation);

// Admin — READ ONLY monitoring, no mutation
router.get("/blood-requests", verifyJWT, authorizeRoles("admin"), getAllBloodRequests);

// Donor routes
router.post("/donation-requests", verifyJWT, authorizeMode("donor"), createDonationRequest);
router.get("/donation-requests/my", verifyJWT, authorizeMode("donor"), getMyDonationRequests);
router.patch("/donation-requests/:id/cancel", verifyJWT, requestDonationCancellation);
router.get("/donation-requests/:id", verifyJWT, authorizeMode("donor"), getDonationRequestDetails);

// Admin donation routes
router.get("/donation-requests", verifyJWT, authorizeRoles("admin"), getAllDonationRequests);

router.get("/health", async (req, res) => {
  try {
    await BloodBanks.findOne({}, { _id: 1 }).lean();
    res.status(200).json({ status: "alive" });
  } catch (err) {
    res.status(500).json({ status: "error" });
  }
});

export default router
