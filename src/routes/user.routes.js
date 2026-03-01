import { Router } from "express";
import { fetchBloodBanksByPinCode } from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { loginUser, registerUser, logoutUser, refreshAccessToken } from "../controllers/auth.controller.js";
import { BloodBanks } from "../models/bloodbanks.model.js"; 
import { ApiResponse } from "../utils/ApiResponse.js";

const router = Router();

router.route("/bloodbanks").post(fetchBloodBanksByPinCode)

router.post("/auth/register", registerUser)

router.post("/auth/login", loginUser)

// secured routes : those routes that are given to user only when she's logged in

router.route("/auth/logout").post(verifyJWT, logoutUser)

router.route("/auth/refresh-token").post(refreshAccessToken)

router.get("/admin/bloodbanks", verifyJWT, async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit

  const total = await BloodBanks.countDocuments({ role: "bloodbank" })
  const bloodBanks = await BloodBanks.find({ role: "bloodbank" })
    .select("-password -refreshToken")
    .skip(skip)
    .limit(limit)

  res.json(new ApiResponse(200, { bloodBanks, total }, "Blood banks fetched"))
})

router.patch("/admin/bloodbanks/:id/verify", verifyJWT, async (req, res) => {
  const { isApproved } = req.body
  const user = await BloodBanks.findByIdAndUpdate(
    req.params.id,
    { isApproved },
    { new: true }
  ).select("-password -refreshToken")

  res.json(new ApiResponse(200, user, "Verification updated"))
})

export default router
