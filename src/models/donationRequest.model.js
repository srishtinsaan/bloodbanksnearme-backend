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
  age: {
  type: Number,
  required: true,
  min: 18,
  max: 65
},
  availability: {
  type: Date,
  required: true
},
  location: {
  type: String,
  required: true
},

address: {
  type: String,
  required: true
},

permanentAddress: {
  type: String,
  required: true
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
  enum: [
    "pending",              // not yet routed to any bank
    "assigned",              // routed to a bank, awaiting their action
    "accepted",              // bank accepted, donor to visit
    "fulfilled",              // donation completed (was "confirmed")
    "rejected",              // all assignments rejected, no bank available
    "cancelled",
    "cancellation_requested",
  ],
  default: "pending"
},

  cancellationReason: {
    type: String
  },
  assignments: [
    {
      bank: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      bankName: {
        type: String,
        required: true,
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
  ]
}, { timestamps: true });

donationRequestSchema.index({ userId: 1 });
donationRequestSchema.index({ status: 1 });
donationRequestSchema.index({ pincode: 1 });
donationRequestSchema.index({ "assignments.bank": 1 });

export const DonationRequest = mongoose.model("DonationRequest", donationRequestSchema);