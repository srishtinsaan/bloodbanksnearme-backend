// controllers/notification.controller.js
import { Notification } from "../models/notification.model.js";

// GET /notifications — returns recent notifications for the logged-in user
const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.json({ data: notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch notifications." });
  }
};

// PATCH /notifications/:id/read — mark a single notification as read
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    res.json({ data: notification });
  } catch (err) {
    res.status(500).json({ message: "Failed to update notification." });
  }
};

// PATCH /notifications/read-all — mark everything as read for this user
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to update notifications." });
  }
};

export { getMyNotifications, markAsRead, markAllAsRead };