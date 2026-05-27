import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";

const registerDonor = asyncHandler(async (req, res) => {

  const {
    fullName,
    age,
    gender,
    bloodGroup,
    phoneNumber,
    email,
    city,
    medicalConditions
  } = req.body;

  // Validation
  if (!fullName || !age || !gender || !bloodGroup || !phoneNumber || !city) {
    throw new ApiError(400, "Required donor fields are missing");
  }

  if (isNaN(age) || age < 18) {
    throw new ApiError(400, "Donor must be at least 18 years old");
  }

  if (phoneNumber.toString().length !== 10) {
    throw new ApiError(400, "Phone number must be 10 digits");
  }

  // Check if donor already exists
  const existingDonor = await User.findOne({
    $or: [{ email }, { phone: phoneNumber }]
  });

  if (existingDonor) {
    throw new ApiError(409, "Donor already registered");
  }

  // Create donor
  const donor = await User.create({
    username: fullName,
    age,
    gender,
    bloodGroup,
    phone: phoneNumber,
    email,
    city,
    medicalConditions,
    role: "donor",
    isApproved: true
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        donor,
        "Donor registered successfully"
      )
    );
});

export {
  registerDonor
};