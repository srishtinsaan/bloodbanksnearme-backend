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

  const total = await BloodBanks.countDocuments()
  
  const bloodBanks = await BloodBanks.find(
    {},
    {
      " Blood Bank Name": 1,
      " Address": 1,
      " State": 1,
      " District": 1,
      " City": 1,
      " Contact No": 1,
      " Mobile": 1,
      " Category": 1,
      " Government": 1,
      " Blood Component Available": 1,
      " Apheresis": 1,
      " Service Time": 1,
      " Helpline": 1,
      " Email": 1,
      " Website": 1,
      " Nodal Officer": 1,
      " Contact Nodal Officer": 1,
      " Mobile Nodal Officer": 1,
      " Email Nodal Officer": 1,
      " Qualification Nodal Officer": 1,
      " License #": 1,
      " Date License Obtained": 1,
      " Date of Renewal": 1,
      " Latitude": 1,
      " Longitude": 1,
      "Pincode": 1,
      _id: 1,
      isApproved: 1,
    }
  )
  .skip(skip)
  .limit(limit)
  .lean()

  res.json(new ApiResponse(200, { bloodBanks, total }, "Blood banks fetched"))
})

router.patch("/admin/bloodbanks/verify-all", verifyJWT, async (req, res) => {
  await BloodBanks.updateMany({}, { isApproved: true })
  res.json(new ApiResponse(200, {}, "All blood banks verified"))
})

router.patch("/admin/bloodbanks/:id/verify", verifyJWT, async (req, res) => {
  const { isApproved } = req.body
  const bank = await BloodBanks.findByIdAndUpdate(
    req.params.id,
    { isApproved },
    { new: true }
  ) // ✅ removed .select()

  res.json(new ApiResponse(200, bank, "Verification updated"))
})

export default router
