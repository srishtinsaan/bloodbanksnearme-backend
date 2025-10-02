import mongoose , {Schema} from "mongoose";

const bloodbanksSchema = new Schema({
    srNo: Number,
    bloodBankName: { type: String, required: true },
    state: { type: String, required: true },
    district: { type: String },
    city: { type: String },
    address: { type: String },
    pincode: { type: Number },
    contactNo: { type: String },
    mobile: { type: Number },
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

}, {timestamps : true})

export const BloodBanks = mongoose.model("BloodBanks", bloodbanksSchema)
