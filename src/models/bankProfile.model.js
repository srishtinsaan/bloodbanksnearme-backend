import mongoose, { Schema } from "mongoose";

const bankProfileSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // enforces the 1-to-1 relationship at the DB level
    },

    // ── Public directory fields (migrated from BloodBanks CSV data) ──
    bloodBankName: { type: String },
    address: { type: String },
    state: { type: String },
    district: { type: String },
    city: { type: String },
    pincode: { type: String, trim: true },
    contactNo: { type: String },
    mobile: { type: String },
    helpline: { type: String },
    email: { type: String },
    website: { type: String },

    nodalOfficer: { type: String },
    contactNodalOfficer: { type: String },
    mobileNodalOfficer: { type: String },
    emailNodalOfficer: { type: String },
    qualificationNodalOfficer: { type: String },

    category: { type: String },
    bloodComponentAvailable: { type: String },
    apheresis: { type: String },
    serviceTime: { type: String },

    licenseNumber: { type: String },
    dateLicenseObtained: { type: String },
    dateOfRenewal: { type: String },

    // ── Geospatial — single source of truth, no separate lat/lng fields ──
    // longitude = location.coordinates[0], latitude = location.coordinates[1]
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },

    // ── Authenticated-operations fields ──
    inventory: {
      "A+": { type: Number, default: 0 },
      "A-": { type: Number, default: 0 },
      "B+": { type: Number, default: 0 },
      "B-": { type: Number, default: 0 },
      "O+": { type: Number, default: 0 },
      "O-": { type: Number, default: 0 },
      "AB+": { type: Number, default: 0 },
      "AB-": { type: Number, default: 0 },
    },

    // mirrors User.isApproved — kept here too since public search reads
    // BankProfile directly and shouldn't have to join back to User to
    // check approval status
    isApproved: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

bankProfileSchema.index({ location: "2dsphere" });
bankProfileSchema.index({ pincode: 1 });

export const BankProfile = mongoose.model("BankProfile", bankProfileSchema);