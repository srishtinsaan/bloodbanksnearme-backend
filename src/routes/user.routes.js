import { Router } from "express";
import { fetchBloodBanksByPinCode } from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { loginUser, registerUser, logoutUser, refreshAccessToken } from "../controllers/auth.controller.js";
import { BloodBanks } from "../models/bloodbanks.model.js"; 
import { User } from "../models/user.model.js"; 
import {registerDonor} from "../controllers/donor.controller.js"
import {Donor} from "../models/donor.model.js"
import { authorizeRoles } from "../middlewares/authorizeRoles.js";
import { authorizeMode } from "../middlewares/authorizeMode.js";
import { ApiError } from "../utils/ApiError.js";

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

  // Fetch unverified registered banks from User model (always show first)
  const unverifiedUsers = await User.find(
    { role: "bloodbank", isApproved: false },
    {
      username: 1,
      email: 1,
      phone: 1,
      pincode: 1,
      licenseNumber: 1,
      isApproved: 1,
      _id: 1,
    }
  )
  .sort({ updatedAt: -1 })
  .lean()

  // Transform user model fields to match CSV style
  const transformedUsers = unverifiedUsers.map(u => ({
    _id: u._id,
    " Blood Bank Name": u.username,
    " Email": u.email,
    " Mobile": u.phone,
    " License #": u.licenseNumber,
    "Pincode": u.pincode,
    isApproved: false,
    source: "user" // to identify which model it came from
  }))

  // Fetch from BloodBanks model with pagination
  const total = await BloodBanks.countDocuments()
  const verifiedCount = await BloodBanks.countDocuments({ isApproved: true })

  const bloodBanks = await BloodBanks.find(
    {},
    {
      " Blood Bank Name": 1,
      " Email": 1,
      " Mobile": 1,
      " License #": 1,
      "Pincode": 1,
      isApproved: 1,
      _id: 1,
    }
  )
  .skip(skip)
  .limit(limit)
  .lean()

  // Combine: unverified users first, then paginated bloodbanks
  const combined = [...transformedUsers, ...bloodBanks]

  res.json(new ApiResponse(200, {
    bloodBanks: combined,
    total: total + unverifiedUsers.length,
    verifiedCount
  }, "Blood banks fetched"))
})

router.patch("/admin/bloodbanks/:id/verify", verifyJWT, async (req, res) => {
  const { isApproved, source } = req.body

  if (source === "user") {
    // Update in User model
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isApproved },
      { new: true }
    )
    return res.json(new ApiResponse(200, user, "User bank verification updated"))
  }

  // Update in BloodBanks model
  const bank = await BloodBanks.findByIdAndUpdate(
    req.params.id,
    { isApproved },
    { new: true }
  )
  res.json(new ApiResponse(200, bank, "Verification updated"))
})

// GET /api/admin/users?role=donor&page=1&limit=10
router.get("/admin/users", verifyJWT, async (req, res) => {
  const { role } = req.query
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  const filter = ["donor", "recipient"].includes(role)
      ? { role: "user", mode: role }
      : { role };
  const total = await User.countDocuments(filter)
  const users = await User.find(filter)
    .select("-password -refreshToken")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()

  res.json(new ApiResponse(200, { users, total }, "Users fetched"))
})

// PATCH /api/admin/users/:id/verify
router.patch("/admin/users/:id/verify", verifyJWT, async (req, res) => {
  const { isApproved } = req.body
  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    { isApproved },
    { new: true }
  ).select("-password -refreshToken")

  res.json(new ApiResponse(200, updatedUser, "User verification updated"))
})

// GET /api/admin/stats
router.get("/admin/stats", verifyJWT, async (req, res) => {
  const users = await User.countDocuments({
    role: "user",
  })

  const registeredBloodBanks =
    await User.countDocuments({
      role: "bloodbank",
    })

  const dbBloodBanks =
    await BloodBanks.countDocuments()

  const totalBloodBanks =
    registeredBloodBanks + dbBloodBanks

  res.json(
    new ApiResponse(
      200,
      {
        users,
        bloodBanks: totalBloodBanks,
        registeredBloodBanks,
        dbBloodBanks,
      },
      "Stats fetched"
    )
  )
})

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



export default router
