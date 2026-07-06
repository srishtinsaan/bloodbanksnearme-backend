import mongoose , {Schema} from "mongoose";

const bloodbanksSchema = new Schema({
    srNo: Number,
    bloodBankName: { type: String, required: true },
    state: { type: String, required: true },
    district: { type: String },
    city: { type: String },
    address: { type: String },
    pincode: { type: String },
    contactNo: { type: String },
    mobile: {
    type: String,
},
    helpline: { type: String },
    fax: { type: String },
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
    licenseNo: { type: String },
    dateLicenseObtained: { type: String },
    dateOfRenewal: { type: String },

    latitude: { type: Number },
    longitude: { type: Number },
    isVerified: {
    type: Boolean,
    default: false
},

verificationStatus: {
    type: String,
    enum: ["pending", "verified", "rejected"],
    default: "pending"
},

verifiedAt: {
    type: Date,
    default: null
},

verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
},

rejectionReason: {
    type: String,
    default: ""
},
documents: {
    licenseCertificate: String,
    registrationCertificate: String,
    ownerIdProof: String
},

    inventory: {
  "A+": { type: Number, default: 0 },
  "A-": { type: Number, default: 0 },
  "B+": { type: Number, default: 0 },
  "B-": { type: Number, default: 0 },
  "O+": { type: Number, default: 0 },
  "O-": { type: Number, default: 0 },
  "AB+": { type: Number, default: 0 },
  "AB-": { type: Number, default: 0 },
}

}, {timestamps : true})

bloodbanksSchema.index({ pincode: 1 });

export const BloodBanks = mongoose.model("BloodBanks", bloodbanksSchema)
