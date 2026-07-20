import { asyncHandler } from "../../src/utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { BloodBanks } from "../models/bloodbanks.model.js";
import { getCoordinatesFromPincode } from "../utils/geocode.js";

const PROJECTION = {
  bloodBankName: 1,
  address: 1,
  state: 1,
  district: 1,
  city: 1,
  contactNo: 1,
  mobile: 1,
  category: 1,
  bloodComponentAvailable: 1,
  apheresis: 1,
  serviceTime: 1,
  helpline: 1,
  email: 1,
  website: 1,
  nodalOfficer: 1,
  contactNodalOfficer: 1,
  mobileNodalOfficer: 1,
  emailNodalOfficer: 1,
  qualificationNodalOfficer: 1,
  licenseNo: 1,
  dateLicenseObtained: 1,
  dateOfRenewal: 1,
  latitude: 1,
  longitude: 1,
  inventory: 1,
  pincode: 1,
};

const RESULT_LIMIT = 10;

const fetchBloodBanksByPinCode = asyncHandler(async (req, res) => {
  const { pincode } = req.body;

  // ... validation same rahegi ...

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timings = {}; // yahan sab timings collect karenge

  const overallStart = Date.now();

  // 1. DB connection timing — agar connectDB() yahin call hoti hai
  const dbStart = Date.now();
  await connectDB(); // agar already connected hai, ye turant return karega
  timings.dbConnection = Date.now() - dbStart;

  // 2. Exact match query
  const exactStart = Date.now();
  const exactBanks = await BloodBanks.find({ pincode: pincode.toString() }, PROJECTION).lean();
  timings.exactMatchQuery = Date.now() - exactStart;

  if (exactBanks.length >= RESULT_LIMIT) {
    timings.total = Date.now() - overallStart;
    console.log(`[${requestId}] TIMINGS:`, timings);
    return res.status(200).json(new ApiResponse(200, { banks: exactBanks.slice(0, RESULT_LIMIT), isFallback: false }, "..."));
  }

  // 3. Coordinates timing — WITH source tracking
  const coordStart = Date.now();
  const coords = await getCoordinatesFromPincode(pincode.toString());
  timings.coordinates = Date.now() - coordStart;
  // NOTE: getCoordinatesFromPincode ke andar bhi source log karna hai (niche dikhaya hai)

  // 4. GeoNear timing
  const geoStart = Date.now();
  // ... $geoNear query yahan ...
  timings.geoNear = Date.now() - geoStart;

  timings.total = Date.now() - overallStart;
  console.log(`[${requestId}] TIMINGS:`, timings);

  return res.status(200).json(/* ... */);
});

export { fetchBloodBanksByPinCode };