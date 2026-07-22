// routes/notification.route.js
import { Router } from "express";

import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
} from "../controllers/notification.controller.js";

// Replace `protect` with your existing auth middleware
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

// Static routes first
router.get("/", protect, getMyNotifications);
router.patch("/read-all", protect, markAllAsRead);

// Dynamic routes after
router.patch("/:id/read", protect, markAsRead);

export default router;