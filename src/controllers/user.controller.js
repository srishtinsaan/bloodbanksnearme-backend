import { asyncHandler } from "../../src/utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { BloodBanks } from "../models/bloodbanks.model.js";
import { haversineDistance } from "../utils/haversine.js";
import { MinHeap } from "../utils/minHeap.js";
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
};

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

  console.log("Serving from MongoDB 💾");

  // 1. Exact pincode search
  const exactBanks = await BloodBanks.find(
    { pincode: pincode.toString() },
    PROJECTION
  ).lean();

  if (exactBanks.length > 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          banks: exactBanks,
          isFallback: false,
        },
        "Blood banks fetched successfully"
      )
    );
  }

  // 2. Fallback to nearest banks
  const coords = await getCoordinatesFromPincode(pincode.toString());

  if (!coords) {
    throw new ApiError(404, "Unable to locate the entered pincode");
  }

  const { latitude, longitude } = coords;

  const candidateBanks = await BloodBanks.find(
    {
      latitude: { $ne: null },
      longitude: { $ne: null },
    },
    PROJECTION
  ).lean();

  if (!candidateBanks.length) {
    throw new ApiError(404, "No blood banks found");
  }

  const heap = new MinHeap();

  for (const bank of candidateBanks) {
    const distance = haversineDistance(
      latitude,
      longitude,
      bank.latitude,
      bank.longitude
    );

    heap.push(distance, {
      ...bank,
      distance: Number(distance.toFixed(2)),
    });
  }

  const nearestBanks = [];
  const LIMIT = 5;

  while (!heap.isEmpty() && nearestBanks.length < LIMIT) {
    nearestBanks.push(heap.pop().data);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        banks: nearestBanks,
        isFallback: true,
      },
      "No blood banks found in this pincode. Showing nearby blood banks."
    )
  );
});

export { fetchBloodBanksByPinCode };