import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/authorizeRoles.js";

import {
  getAllUsers,
  verifyBank,
  getStats,
} from "../controllers/admin.controller.js";

import { getAllBloodRequests, getBloodRequestDetailsForAdmin } from "../controllers/bloodRequest.controller.js";
import { getAllDonationRequests, getDonationRequestDetailsForAdmin } from "../controllers/donationRequest.controller.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("admin"));

router.get("/users", getAllUsers);
router.patch("/users/:id/verify", verifyBank);

router.get("/stats", getStats);

// read-only monitoring — admin never mutates a request's lifecycle on
// either blood requests or donation requests, only observes them
router.get("/blood-requests", getAllBloodRequests);
router.get("/blood-requests/:id", getBloodRequestDetailsForAdmin);

router.get("/donation-requests", getAllDonationRequests);
router.get("/donation-requests/:id", getDonationRequestDetailsForAdmin);

export default router;