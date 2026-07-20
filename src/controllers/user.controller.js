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

  if (!pincode) {
    throw new ApiError(400, "Pincode is required");
  }
  if (isNaN(pincode)) {
    throw new ApiError(400, "Pincode must be a number");
  }
  if (pincode.toString().length !== 6) {
    throw new ApiError(400, "Pincode must be exactly 6 digits");
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // connectDB() yahan CALL NAHI karni — middleware mein pehle hi ho chuki hai
  // request tumtak pahunchne se pehle. Uska time req.dbConnectionTime mein
  // pehle se mila hua hai.
  const timings = { dbConnection: req.dbConnectionTime || 0 };
  const overallStart = Date.now();

  // 1. Exact match query
  const exactStart = Date.now();
  const exactBanks = await BloodBanks.find(
    { pincode: pincode.toString() },
    PROJECTION
  ).lean();
  timings.exactMatchQuery = Date.now() - exactStart;

  if (exactBanks.length >= RESULT_LIMIT) {
    timings.total = Date.now() - overallStart;
    console.log(`[${requestId}] TIMINGS:`, timings);

    return res.status(200).json(
      new ApiResponse(
        200,
        { banks: exactBanks.slice(0, RESULT_LIMIT), isFallback: false },
        "Blood banks fetched successfully"
      )
    );
  }

  // 2. Coordinates (source tracking already added inside geocode.js)
  const coordStart = Date.now();
  const coords = await getCoordinatesFromPincode(pincode.toString());
  timings.coordinates = Date.now() - coordStart;

  if (!coords) {
    timings.total = Date.now() - overallStart;
    console.log(`[${requestId}] TIMINGS:`, timings);

    return res.status(200).json(
      new ApiResponse(
        200,
        { banks: exactBanks, isFallback: false },
        exactBanks.length > 0
          ? "Blood banks fetched successfully"
          : "Unable to locate the entered pincode"
      )
    );
  }

  const { latitude, longitude } = coords;
  const exactIds = exactBanks.map((b) => b._id);

  // 3. GeoNear query — ye tha khaali comment, ab actual query hai
  const geoStart = Date.now();
  const nearestBanks = await BloodBanks.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [longitude, latitude] },
        distanceField: "distance",
        spherical: true,
        query: { _id: { $nin: exactIds } }, // exact wale dobara mat do
      },
    },
    { $limit: RESULT_LIMIT - exactBanks.length },
    { $project: { ...PROJECTION, distance: 1 } },
  ]);
  timings.geoNear = Date.now() - geoStart;

  const combinedBanks = [...exactBanks, ...nearestBanks];

  timings.total = Date.now() - overallStart;
  console.log(`[${requestId}] TIMINGS:`, timings);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        banks: combinedBanks,
        isFallback: exactBanks.length === 0,
        exactCount: exactBanks.length,
        nearestCount: nearestBanks.length,
      },
      exactBanks.length > 0
        ? "Blood banks fetched successfully"
        : "No blood banks found in this pincode. Showing nearby blood banks."
    )
  );
});

export { fetchBloodBanksByPinCode };