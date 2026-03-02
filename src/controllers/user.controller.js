import { asyncHandler } from "../../src/utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { BloodBanks } from "../models/bloodbanks.model.js";
import { connectRedis } from "../config/redis.js";


const fetchBloodBanksByPinCode = asyncHandler(async (req, res) => {

  const { pincode } = req.body;

  // Validation FIRST
  if (!pincode) {
    throw new ApiError(400, "Pincode is required");
  }

  if (isNaN(pincode)) {
    throw new ApiError(400, "Pincode must be a number");
  }

  if (pincode.toString().length !== 6) {
    throw new ApiError(400, "Pincode must be exactly 6 digits");
  }

  const redis = await connectRedis();
  const cacheKey = `bloodbanks:${pincode}`;

  //  Check Cache
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    console.log("Serving from Redis ⚡");

    return res
      .status(200)
      .json(new ApiResponse(
        200,
        JSON.parse(cachedData),
        "Blood banks fetched successfully (cache)"
      ));
  }

  //  Fetch From MongoDB
  console.log("Serving from MongoDB 💾");

  const banks = await BloodBanks.find(
    { Pincode: Number(pincode) },
    {
      " Blood Bank Name": 1,
      _id: 0,
      " Address": 1,
      " State": 1,
      " District": 1,
      " City": 1,
      " Contact No": 1,
      " Mobile": 1,
      " Category": 1,
      " Government": 1,
      " Blood Component Available": 1,
      " Apheresis": 1,
      " Service Time": 1,
      " Helpline": 1,
      " Email": 1,
      " Website": 1,
      " Nodal Officer": 1,
      " Contact Nodal Officer": 1,
      " Mobile Nodal Officer": 1,
      " Email Nodal Officer": 1,
      " Qualification Nodal Officer": 1,
      " License #": 1,
      " Date License Obtained": 1,
      " Date of Renewal": 1,
      " Latitude" : 1,
      " Longitude" : 1
    }
  ).lean();

  if (!banks || banks.length === 0) {
    throw new ApiError(404, "No blood banks found for this pincode");
  }

  // Store In Redis (10 min expiry)
  await redis.setEx(cacheKey, 600, JSON.stringify(banks));

  return res
    .status(200)
    .json(new ApiResponse(
      200,
      banks,
      "Blood banks fetched successfully"
    ));
});


export {
  fetchBloodBanksByPinCode
};
