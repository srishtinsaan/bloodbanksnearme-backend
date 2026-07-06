import mongoose from "mongoose";
import dotenv from "dotenv";
import { BloodBanks } from "../src/models/bloodbanks.model.js"; // adjust path if needed
import { DB_NAME } from "../src/constants.js";

dotenv.config();

const normalize = (doc) => ({
  srNo: doc["Sr No"],
  bloodBankName: doc[" Blood Bank Name"]?.trim() || null,
  state: doc[" State"]?.trim() || null,
  district: doc[" District"]?.trim() || null,
  city: doc[" City"]?.trim() || null,
  address: doc[" Address"]?.trim() || null,
  pincode: String(doc["Pincode"] ?? ""),

  contactNo: doc[" Contact No"] && doc[" Contact No"] !== "NA" ? doc[" Contact No"] : null,
  mobile: doc[" Mobile"] && doc[" Mobile"] !== "NA" ? String(doc[" Mobile"]) : null,
  helpline: doc[" Helpline"] && doc[" Helpline"] !== "NA" ? doc[" Helpline"] : null,
  fax: doc[" Fax"] && doc[" Fax"] !== "NA" ? doc[" Fax"] : null,
  email: doc[" Email"] && doc[" Email"] !== "NA" ? doc[" Email"] : null,
  website: doc[" Website"] && doc[" Website"] !== "NA" ? doc[" Website"] : null,

  nodalOfficer: doc[" Nodal Officer "] && doc[" Nodal Officer "] !== "NA" ? doc[" Nodal Officer "] : null,
  contactNodalOfficer: doc[" Contact Nodal Officer"] && doc[" Contact Nodal Officer"] !== "NA" ? doc[" Contact Nodal Officer"] : null,
  mobileNodalOfficer: doc[" Mobile Nodal Officer"] && doc[" Mobile Nodal Officer"] !== "NA" ? doc[" Mobile Nodal Officer"] : null,
  emailNodalOfficer: doc[" Email Nodal Officer"] && doc[" Email Nodal Officer"] !== "NA" ? doc[" Email Nodal Officer"] : null,
  qualificationNodalOfficer: doc[" Qualification Nodal Officer"] && doc[" Qualification Nodal Officer"] !== "NA" ? doc[" Qualification Nodal Officer"] : null,

  category: doc[" Category"]?.trim() || null,
  bloodComponentAvailable: doc[" Blood Component Available"] === "YES" ? "true" : "false",
  apheresis: doc[" Apheresis"] === "YES" ? "true" : "false",
  serviceTime: doc[" Service Time"]?.trim() || null,

  licenseNo: doc[" License #"] && doc[" License #"] !== "NA" ? doc[" License #"] : null,
  dateLicenseObtained: doc[" Date License Obtained"] && doc[" Date License Obtained"] !== "NA" ? doc[" Date License Obtained"] : null,
  dateOfRenewal: doc[" Date of Renewal"] && doc[" Date of Renewal"] !== "NA" ? doc[" Date of Renewal"] : null,

  latitude: doc[" Latitude"],
  longitude: doc[" Longitude"],

  inventory: doc.inventory || {},

  // schema has no isApproved — use isVerified/verificationStatus instead
  isVerified: doc.isVerified ?? true,
  verificationStatus: doc.verificationStatus ?? "verified",
});

const migrate = async () => {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);

    const banks = await BloodBanks.find();

    console.log(`Found ${banks.length} blood banks`);

    let count = 0;

    for (const bank of banks) {
      const normalized = normalize(bank.toObject());

      await BloodBanks.findByIdAndUpdate(bank._id, normalized, {
        overwrite: true,
      });

      count++;
    }

    console.log(`✅ Migrated ${count} blood banks.`);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

migrate();