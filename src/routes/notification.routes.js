// routes/notification.route.js
import { Router } from "express";

import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} from "../controllers/notification.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Static routes first
router.get("/", verifyJWT, getMyNotifications);
router.patch("/read-all", verifyJWT, markAllAsRead);

// Dynamic routes after
router.patch("/:id/read", verifyJWT, markAsRead);

// notification.routes.js mein
router.delete("/:id", verifyJWT, deleteNotification);
export default router;