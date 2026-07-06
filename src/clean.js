import mongoose from "mongoose";
import dotenv from "dotenv";
import { BloodBank } from "../src/models/bloodbank.model.js"; // adjust path if needed
import { DB_NAME } from "./constants.js";

dotenv.config();

const cleanup = async () => {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);

    const banks = await BloodBank.find();

    console.log(`Found ${banks.length} blood banks`);

    let count = 0;

    for (const bank of banks) {
      const old = bank.toObject();

      await BloodBank.findByIdAndUpdate(bank._id, {
        $set: {
          srNo: old.srNo ?? old["Sr No"],

          name: old.name ?? old[" Blood Bank Name"]?.trim() ?? null,
          state: old.state ?? old[" State"]?.trim() ?? null,
          district: old.district ?? old[" District"]?.trim() ?? null,
          city: old.city ?? old[" City"]?.trim() ?? null,
          address: old.address ?? old[" Address"]?.trim() ?? null,

          pincode: String(old.pincode ?? old["Pincode"] ?? ""),

          contactNo:
            old.contactNo ??
            (old[" Contact No"] !== "NA" ? old[" Contact No"] : null),

          mobile:
            old.mobile ??
            (old[" Mobile"] && old[" Mobile"] !== "NA"
              ? String(old[" Mobile"])
              : null),

          helpline:
            old.helpline ??
            (old[" Helpline"] !== "NA" ? old[" Helpline"] : null),

          fax:
            old.fax ??
            (old[" Fax"] !== "NA" ? old[" Fax"] : null),

          email:
            old.email ??
            (old[" Email"] !== "NA" ? old[" Email"] : null),

          website:
            old.website ??
            (old[" Website"] !== "NA" ? old[" Website"] : null),

          category:
            old.category ?? old[" Category"]?.trim() ?? null,

          serviceTime:
            old.serviceTime ?? old[" Service Time"]?.trim() ?? null,

          latitude: old.latitude ?? old[" Latitude"] ?? null,
          longitude: old.longitude ?? old[" Longitude"] ?? null,

          inventory: old.inventory ?? {},

          isApproved: old.isApproved ?? false,

          nodalOfficer:
            old.nodalOfficer ??
            (old[" Nodal Officer "] !== "NA"
              ? old[" Nodal Officer "]
              : null),

          nodalOfficerContact:
            old.nodalOfficerContact ??
            (old[" Contact Nodal Officer"] !== "NA"
              ? old[" Contact Nodal Officer"]
              : null),

          nodalOfficerMobile:
            old.nodalOfficerMobile ??
            (old[" Mobile Nodal Officer"] !== "NA"
              ? old[" Mobile Nodal Officer"]
              : null),

          nodalOfficerEmail:
            old.nodalOfficerEmail ??
            (old[" Email Nodal Officer"] !== "NA"
              ? old[" Email Nodal Officer"]
              : null),

          nodalOfficerQualification:
            old.nodalOfficerQualification ??
            (old[" Qualification Nodal Officer"] !== "NA"
              ? old[" Qualification Nodal Officer"]
              : null),

          licenseNumber:
            old.licenseNumber ??
            (old[" License #"] !== "NA"
              ? old[" License #"]
              : null),

          licenseObtainedDate:
            old.licenseObtainedDate ??
            (old[" Date License Obtained"] !== "NA"
              ? old[" Date License Obtained"]
              : null),

          licenseRenewalDate:
            old.licenseRenewalDate ??
            (old[" Date of Renewal"] !== "NA"
              ? old[" Date of Renewal"]
              : null),

          apheresis:
            old.apheresis === true ||
            old.apheresis === "true" ||
            old[" Apheresis"] === "YES",

          bloodComponentAvailable:
            old.bloodComponentAvailable === true ||
            old.bloodComponentAvailable === "true" ||
            old[" Blood Component Available"] === "YES",
        },

        $unset: {
          "Sr No": "",
          " Blood Bank Name": "",
          " State": "",
          " District": "",
          " City": "",
          " Address": "",
          Pincode: "",
          " Contact No": "",
          " Mobile": "",
          " Helpline": "",
          " Fax": "",
          " Email": "",
          " Website": "",
          " Nodal Officer ": "",
          " Contact Nodal Officer": "",
          " Mobile Nodal Officer": "",
          " Email Nodal Officer": "",
          " Qualification Nodal Officer": "",
          " Category": "",
          " Blood Component Available": "",
          " Apheresis": "",
          " Service Time": "",
          " License #": "",
          " Date License Obtained": "",
          " Date of Renewal": "",
          " Latitude": "",
          " Longitude": "",
        },
      });

      count++;

      if (count % 200 === 0) {
        console.log(`${count}/${banks.length} cleaned...`);
      }
    }

    console.log(`✅ Successfully cleaned ${count} blood banks.`);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

cleanup();