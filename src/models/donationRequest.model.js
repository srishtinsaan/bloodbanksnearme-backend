import mongoose, { Schema } from "mongoose";

const donationRequestSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
      required: true,
    },
    age: {
      type: Number,
      required: true,
      min: 18,
      max: 65,
    },
    availability: {
      type: Date,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    permanentAddress: {
      type: String,
      required: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    pincode: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
    },

    // request-level status — separate from each assignment's own status below
    status: {
      type: String,
      enum: [
        "pending",
        "assigned",
        "accepted",
        "fulfilled",
        "rejected",
        "cancelled",
        "cancellation_requested",
      ],
      default: "pending",
    },
    cancellationReason: {
      type: String,
    },

    // ── bank assignment lifecycle (mirrors bloodRequest.model.js's pattern) ──
    // THIS is where the status/timestamp/autoAssigned fields belong — they
    // were previously flattened onto the top-level schema by mistake, which
    // meant `assignments` didn't exist as a field at all and every
    // `request.assignments.push(...)` call crashed on undefined.
    assignments: [
      {
        bank: {
          type: Schema.Types.ObjectId,
          ref: "User", // bloodbank-role User (auth identity) — domain data
          // (inventory/location/isApproved) lives on BankProfile, bridged
          // via BankProfile.userId, same pattern as bloodRequest.model.js.
          required: true,
        },
        bankName: {
          type: String,
          required: true,
        },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        status: {
          type: String,
          // "superseded" = another bank accepted this donation first, so this
          // still-pending broadcast assignment was auto-closed without the
          // bank ever acting on it — distinct from "rejected" (bank actively
          // declined) and from the request-level "cancelled" (donor cancelled).
          // "expired" = bank never responded within the response window —
          // distinct from "rejected" (explicit decline) so banks that ignore
          // requests are visible separately from ones that actively said no.
          enum: ["assigned", "accepted", "fulfilled", "rejected", "superseded", "expired"],
          default: "assigned",
        },
        assignedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, default: null },
        acceptedAt: { type: Date, default: null },
        fulfilledAt: { type: Date, default: null },
        rejectedAt: { type: Date, default: null },
        rejectionReason: { type: String, default: "" },
        supersededAt: { type: Date, default: null },
        expiredAt: { type: Date, default: null },
        // true when this assignment was force-accepted by the 48hr/availability
        // safety-net fallback rather than the bank actively accepting itself
        autoAssigned: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

donationRequestSchema.index({ userId: 1 });
donationRequestSchema.index({ status: 1 });
donationRequestSchema.index({ pincode: 1 });
donationRequestSchema.index({ "assignments.bank": 1 });
donationRequestSchema.index({ isDeleted: 1 });

export const DonationRequest = mongoose.model("DonationRequest", donationRequestSchema);