import mongoose, { Schema } from "mongoose";

const donationRequestSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  username: {
    type: String,
    required: true
  },
  bloodGroup: {
    type: String,
    enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
    required: true
  },
  units: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  availability: {
    type: String,
    enum: ["immediate", "within_week", "within_month"],
    default: "immediate"
  },
  location: {
    type: String,
    required: true
  },
  pincode: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  notes: {
    type: String
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "cancelled", "cancellation_requested"],
    default: "pending"
  },
  cancellationReason: {
    type: String
  }
}, { timestamps: true });

donationRequestSchema.index({ userId: 1 });
donationRequestSchema.index({ status: 1 });
donationRequestSchema.index({ pincode: 1 });

export const DonationRequest = mongoose.model("DonationRequest", donationRequestSchema);