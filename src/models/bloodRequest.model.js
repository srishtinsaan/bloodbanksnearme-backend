import mongoose, { Schema } from "mongoose";

const bloodRequestSchema = new Schema(
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

    // ── requester vs. patient — NOT the same person by default ──
    // userId/username above identify the ACCOUNT making the request (the
    // accountable, authenticated party). patientName/relationToPatient
    // describe who the blood is actually FOR. Identity verification (email
    // OTP today, Aadhaar later) verifies the requester — it says nothing
    // about the patient, and shouldn't be conflated with it.
    patientName: {
      type: String,
      required: true,
      // for relationToPatient: "self", controller defaults this to the
      // requester's own username if the client doesn't send one explicitly.
    },

    relationToPatient: {
      type: String,
      enum: ["self", "family", "friend", "other"],
      default: "self",
    },

    patientAge: {
      type: Number,
      default: null,
    },

    bloodType: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
      required: true,
    },

    units: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },

    urgency: {
      type: String,
      enum: ["routine", "urgent"],
      default: "routine",
    },

    reason: {
      type: String,
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

    pincode: {
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

    phoneNumber: {
      type: String,
      required: true,
    },

    notes: {
      type: String,
      default: "",
    },

    // single source of truth — no duplicate key
    status: {
      type: String,
      enum: [
        "pending",              // just created, not yet routed to any bank
        "assigned",              // routed to at least one bank, awaiting action
        "accepted",              // bank(s) accepted, blood being prepared
        "partially_fulfilled",   // some assignments fulfilled, request not fully covered yet
        "rejected",              // no bank accepted / all assignments rejected
        "fulfilled",              // all required units delivered
        "cancelled",              // recipient cancelled
        "cancellation_requested", // recipient asked to cancel, pending
      ],
      default: "pending",
    },

    cancellationReason: {
      type: String,
      default: "",
    },

    targetBankName: {
      type: String,
      default: null,
    },

    targetBankPincode: {
      type: String,
      default: null,
    },

    isTargeted: {
      type: Boolean,
      default: false,
    },

    // ── bank assignment lifecycle (supports multi-bank splitting) ──
    assignments: [
      {
        bank: {
          type: Schema.Types.ObjectId,
          ref: "User", // still the bloodbank-role User (its login/auth identity —
          // this is what req.user._id matches against in accept/reject/fulfill).
          // Domain data (inventory, location, license, approval) lives on
          // BankProfile, looked up via BankProfile.userId when needed — this
          // ref intentionally stays pointed at User so bank-scoped auth checks
          // ("assignments.bank": req.user._id) don't need to change.
          required: true,
        },
        bankName: {
          type: String,
          required: true,
        },
        unitsAssigned: {
          type: Number,
          required: true,
          min: 1,
        },
        status: {
          type: String,
          enum: ["assigned", "accepted", "fulfilled", "rejected"],
          default: "assigned",
        },
        assignedAt: { type: Date, default: Date.now },
        acceptedAt: { type: Date, default: null },
        fulfilledAt: { type: Date, default: null },
        rejectedAt: { type: Date, default: null },
        rejectionReason: { type: String, default: "" },
      },
    ],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    // ── broadcast fallback (critical requests only) ──
    broadcastActive: {
      type: Boolean,
      default: false,
    },
    broadcastRadius: {
      // null means "no distance cutoff — visible to all approved banks"
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

bloodRequestSchema.index({ userId: 1 });
bloodRequestSchema.index({ status: 1 });
bloodRequestSchema.index({ pincode: 1 });
bloodRequestSchema.index({ "assignments.bank": 1 });
bloodRequestSchema.index({ isDeleted: 1 });

export const BloodRequest = mongoose.model(
  "BloodRequest",
  bloodRequestSchema
);