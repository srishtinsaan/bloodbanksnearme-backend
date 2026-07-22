// models/notification.model.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "BLOOD_REQUEST_ASSIGNED",
        "BLOOD_REQUEST_ACCEPTED",
        "BLOOD_REQUEST_REJECTED",
        "BLOOD_REQUEST_FULFILLED",
        "DONATION_REQUEST_ASSIGNED",
        "DONATION_REQUEST_ACCEPTED",
        "DONATION_REQUEST_FULFILLED",
        "DONATION_CANCELLATION_REQUESTED",
      ],
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    // Generic reference — could point to a BloodRequest or DonationRequest doc.
    relatedRequest: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "relatedRequestModel",
    },
    relatedRequestModel: {
      type: String,
      enum: ["BloodRequest", "DonationRequest"],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Supports the most common query: "give me this user's unread notifications, newest first"
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);