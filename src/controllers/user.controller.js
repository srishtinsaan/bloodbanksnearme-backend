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

  if (!pincode) throw new ApiError(400, "Pincode is required");
  if (isNaN(pincode)) throw new ApiError(400, "Pincode must be a number");
  if (pincode.toString().length !== 6) throw new ApiError(400, "Pincode must be exactly 6 digits");

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  console.log(`START REQUEST: ${requestId}`);
  console.time(`TOTAL-${requestId}`);

  // 1. Exact pincode matches — same as before, untouched
  const exactBanks = await BloodBanks.find(
    { pincode: pincode.toString() },
    PROJECTION
  ).lean();

  console.log("Exact banks found:", exactBanks.length);

  if (exactBanks.length >= RESULT_LIMIT) {
    console.timeEnd(`TOTAL-${requestId}`);
    console.log(`END REQUEST: ${requestId}, Banks found: ${exactBanks.length}`);
    return res.status(200).json(
      new ApiResponse(200, { banks: exactBanks.slice(0, RESULT_LIMIT), isFallback: false }, "Blood banks fetched successfully")
    );
  }

  // 2. Need to fill remaining slots — geocode the pincode
  console.time(`COORDINATES-${requestId}`);
  const coords = await getCoordinatesFromPincode(pincode.toString());
  console.timeEnd(`COORDINATES-${requestId}`);

  // 3. $geoNear replaces fetch-all + Haversine + heap
  const exactIds = exactBanks.map((b) => b._id);
  const needed = RESULT_LIMIT - exactBanks.length;

  console.time(`GEO-NEAR-${requestId}`);
  const nearestRaw = await BloodBanks.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [coords.longitude, coords.latitude] },
        distanceField: "distanceMeters",
        spherical: true,
        query: { _id: { $nin: exactIds } },
      },
    },
    { $limit: needed },
    { $project: { ...PROJECTION, distanceMeters: 1 } },
  ]);
  console.timeEnd(`GEO-NEAR-${requestId}`);

  const nearestBanks = nearestRaw.map((b) => ({
    ...b,
    distance: Number((b.distanceMeters / 1000).toFixed(2)), // km
  }));

  const combinedBanks = [...exactBanks, ...nearestBanks];

  console.timeEnd(`TOTAL-${requestId}`);
  console.log(`END REQUEST: ${requestId}, Banks found: ${combinedBanks.length} (exact: ${exactBanks.length}, nearest: ${nearestBanks.length})`);

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