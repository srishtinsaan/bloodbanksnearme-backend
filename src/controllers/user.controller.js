import { asyncHandler } from "../../src/utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { BankProfile } from "../models/bankProfile.model.js";
import { getCoordinatesFromPincode } from "../utils/geocode.js";
import { redis } from "../utils/redisClient.js";

// FIXED: licenseNo -> licenseNumber (actual BankProfile schema field name;
// the old key silently returned undefined instead of erroring). Also
// dropped latitude/longitude — BankProfile has no such fields, only the
// GeoJSON `location` field, which is now projected instead.
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
  licenseNumber: 1,
  dateLicenseObtained: 1,
  dateOfRenewal: 1,
  location: 1,
  inventory: 1,
  pincode: 1,
};

const RESULT_LIMIT = 10;
const CACHE_TTL_SECONDS = 60; // short TTL — inventory badal sakti hai, isliye 1 minute hi

const CRITICAL_THRESHOLD_KM = 150; // isse zyada -> critical warning + alternate suggestion

// Excludes manually-created test banks (licenseNumber like "TESTLIC001") from
// ever appearing in real public search results. Case-insensitive so
// "test..."/"Test..."/"TEST..." are all caught. A missing/undefined
// licenseNumber does NOT match this regex (Mongo regex only matches string
// values), so banks without a license number on file are unaffected —
// only ones explicitly starting with "TEST" get filtered out.
const EXCLUDE_TEST_BANKS = { licenseNumber: { $not: /^TEST/i } };

// Updated Controller supporting both GPS Coordinates and Pincode search
const fetchBloodBanksByPinCode = asyncHandler(async (req, res) => {
  // Accept both lat/lng and pincode from the request body (or query)
  const { pincode, lat, lng } = req.body;

  let latitude = lat ? parseFloat(lat) : null;
  let longitude = lng ? parseFloat(lng) : null;
  let exactBanks = [];

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timings = { dbConnection: req.dbConnectionTime || 0 };
  const overallStart = Date.now();

  // If user searched via Pincode and didn't provide GPS
  if ((latitude == null || longitude == null) && pincode) {
    if (isNaN(pincode)) {
      throw new ApiError(400, "Pincode must be a number");
    }
    if (pincode.toString().length !== 6) {
      throw new ApiError(400, "Pincode must be exactly 6 digits");
    }

    const cacheKey = `search:pincode:${pincode}`;
    
    // 1. Cache check for pincode
    const cacheStart = Date.now();
    let cached = null;
    try {
      cached = await redis.get(cacheKey);
    } catch (err) {
      console.log(`[${requestId}] Redis GET failed:`, err.message);
    }
    timings.cacheCheck = Date.now() - cacheStart;

    if (cached) {
      return res.status(200).json(cached);
    }

    // 2. Exact match query by pincode
    const exactStart = Date.now();
    exactBanks = await BankProfile.find(
      { pincode: pincode.toString(), ...EXCLUDE_TEST_BANKS },
      PROJECTION
    ).lean();
    timings.exactMatchQuery = Date.now() - exactStart;

    if (exactBanks.length >= RESULT_LIMIT) {
      const responseData = new ApiResponse(
        200,
        { banks: exactBanks.slice(0, RESULT_LIMIT), isFallback: false, distanceWarning: null },
        "Blood banks fetched successfully"
      );
      redis.set(cacheKey, responseData, { ex: CACHE_TTL_SECONDS }).catch(() => {});
      return res.status(200).json(responseData);
    }

    // 3. Resolve coordinates from pincode if exact match isn't enough
    const coords = await getCoordinatesFromPincode(pincode.toString());
    if (coords) {
      latitude = coords.latitude;
      longitude = coords.longitude;
    }
  }

  // If we still don't have coordinates after trying both methods
  if (latitude == null || longitude == null) {
    const responseData = new ApiResponse(
      200,
      { banks: exactBanks, isFallback: false, distanceWarning: null },
      exactBanks.length > 0 ? "Blood banks fetched successfully" : "Unable to locate the entered location"
    );
    return res.status(200).json(responseData);
  }

  const exactIds = exactBanks.map((b) => b._id);

  // 4. GeoNear query using precise coordinates (whether from GPS or geocoded pincode)
  const geoStart = Date.now();
  const nearestBanks = await BankProfile.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [longitude, latitude] },
        distanceField: "distanceMeters",
        spherical: true,
        query: { _id: { $nin: exactIds }, isApproved: true, ...EXCLUDE_TEST_BANKS },
      },
    },
    { $limit: RESULT_LIMIT - exactBanks.length },
    {
      $project: {
        ...PROJECTION,
        distance: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] },
      },
    },
  ]);
  timings.geoNear = Date.now() - geoStart;

  const combinedBanks = [...exactBanks, ...nearestBanks];

  const farthestNearbyDistance = nearestBanks.length > 0
    ? Math.max(...nearestBanks.map((b) => b.distance))
    : 0;

  let distanceWarning = null;
  if (combinedBanks.length === 0 && farthestNearbyDistance > CRITICAL_THRESHOLD_KM) {
    distanceWarning = {
      level: "critical",
      message: `No blood banks found nearby. Nearest option is ${farthestNearbyDistance} km away.`,
    };
  }

  const responseData = new ApiResponse(
    200,
    {
      banks: combinedBanks,
      isFallback: exactBanks.length === 0,
      distanceWarning,
    },
    "Blood banks fetched successfully"
  );

  timings.total = Date.now() - overallStart;
  console.log(`[${requestId}] TIMINGS:`, timings);

  return res.status(200).json(responseData);
});

export { fetchBloodBanksByPinCode };