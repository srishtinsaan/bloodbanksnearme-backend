import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/authorizeRoles.js";

import {
  getBankBloodRequests,
  getBloodRequestDetailsForBank,
  acceptBloodRequest,
  rejectBloodRequest,
  fulfillBloodRequest,
} from "../controllers/bloodRequest.controller.js";

import {
  getBankDonationRequests,
  acceptDonationRequest,
  rejectDonationRequest,
  fulfillDonationRequest,
} from "../controllers/donationRequest.controller.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("bloodbank"));

router.get("/requests", getBankBloodRequests);
router.get("/requests/:id", getBloodRequestDetailsForBank);

router.patch("/requests/:id/accept", acceptBloodRequest);
router.patch("/requests/:id/reject", rejectBloodRequest);
router.patch("/requests/:id/fulfill", fulfillBloodRequest);

router.get("/donations", getBankDonationRequests);

router.patch("/donations/:id/accept", acceptDonationRequest);
router.patch("/donations/:id/reject", rejectDonationRequest);
router.patch("/donations/:id/fulfill", fulfillDonationRequest);

export default router;