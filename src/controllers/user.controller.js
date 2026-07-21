import { asyncHandler } from "../../src/utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { BloodBanks } from "../models/bloodbanks.model.js";
import { getCoordinatesFromPincode } from "../utils/geocode.js";
import { redis } from "../utils/redisClient.js";

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
const CACHE_TTL_SECONDS = 60; // short TTL — inventory badal sakti hai, isliye 1 minute hi

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
  const timings = { dbConnection: req.dbConnectionTime || 0 };
  const overallStart = Date.now();

  const cacheKey = `search:${pincode}`;

  // 1. Cache check — sabse pehle, MongoDB tak jaane se pehle
  const cacheStart = Date.now();
  const cached = await redis.get(cacheKey);
  timings.cacheCheck = Date.now() - cacheStart;

  if (cached) {
    timings.total = Date.now() - overallStart;
    timings.source = "REDIS_CACHE";
    console.log(`[${requestId}] TIMINGS:`, timings);

    // Upstash client JSON ko automatically parse kar deta hai agar object store kiya tha
    return res.status(200).json(cached);
  }

  // 2. Exact match query
  const exactStart = Date.now();
  const exactBanks = await BloodBanks.find(
    { pincode: pincode.toString() },
    PROJECTION
  ).lean();
  timings.exactMatchQuery = Date.now() - exactStart;

  if (exactBanks.length >= RESULT_LIMIT) {
    const responseData = new ApiResponse(
      200,
      { banks: exactBanks.slice(0, RESULT_LIMIT), isFallback: false },
      "Blood banks fetched successfully"
    );

    // Cache mein daalo, agli baar seedha yahi mile
    await redis.set(cacheKey, responseData, { ex: CACHE_TTL_SECONDS });

    timings.total = Date.now() - overallStart;
    console.log(`[${requestId}] TIMINGS:`, timings);
    return res.status(200).json(responseData);
  }

  // 3. Coordinates
  const coordStart = Date.now();
  const coords = await getCoordinatesFromPincode(pincode.toString());
  timings.coordinates = Date.now() - coordStart;

  if (!coords) {
    const responseData = new ApiResponse(
      200,
      { banks: exactBanks, isFallback: false },
      exactBanks.length > 0
        ? "Blood banks fetched successfully"
        : "Unable to locate the entered pincode"
    );

    timings.total = Date.now() - overallStart;
    console.log(`[${requestId}] TIMINGS:`, timings);
    return res.status(200).json(responseData);
  }

  const { latitude, longitude } = coords;
  const exactIds = exactBanks.map((b) => b._id);

  // 4. GeoNear query
  const geoStart = Date.now();
  const nearestBanks = await BloodBanks.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [longitude, latitude] },
        distanceField: "distance",
        spherical: true,
        query: { _id: { $nin: exactIds } },
      },
    },
    { $limit: RESULT_LIMIT - exactBanks.length },
    { $project: { ...PROJECTION, distance: 1 } },
  ]);
  timings.geoNear = Date.now() - geoStart;

  const combinedBanks = [...exactBanks, ...nearestBanks];

  const responseData = new ApiResponse(
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
  );

  // 5. Cache mein daalo — agli baar isi pincode ke liye MongoDB tak jaana hi nahi padega
  await redis.set(cacheKey, responseData, { ex: CACHE_TTL_SECONDS });

  timings.total = Date.now() - overallStart;
  console.log(`[${requestId}] TIMINGS:`, timings);

  return res.status(200).json(responseData);
});

export { fetchBloodBanksByPinCode };