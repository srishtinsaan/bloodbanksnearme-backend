import mongoose, { Schema } from "mongoose";

const bloodRequestSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  username: {
    type: String,
    required: true
  },
  bloodType: {
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
  urgency: {
    type: String,
    enum: ["routine", "urgent"],
    default: "routine"
  },
  reason: {
    type: String,
    required: true
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
    enum: ["pending", "fulfilled", "cancelled", "cancellation_requested"],
    default: "pending"
  },
  cancellationReason: {
    type: String
  },
  targetBankName: {
  type: String,
  default: null
},
targetBankPincode: {
  type: String,
  default: null
},
isTargeted: {
  type: Boolean,
  default: false  
}
}, { timestamps: true })

bloodRequestSchema.index({ userId: 1 })
bloodRequestSchema.index({ status: 1 })
bloodRequestSchema.index({ pincode: 1 })

export const BloodRequest = mongoose.model("BloodRequest", bloodRequestSchema)