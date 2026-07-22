import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { BankProfile } from "../models/bankProfile.model.js";
import { getCoordinatesFromPincode } from "../utils/geocode.js";
import { sendEmail } from "../utils/sendEmail.js";



const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while generating refresh and access token",
    );
  }
};

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const registerUser = asyncHandler(async (req, res) => {

  const {
    username,
    email,
    password,
    role,
    phone,
    pincode,
    bloodGroup,
    licenseNumber
  } = req.body;

  if (!username || !email || !password || !role) {
    throw new ApiError(400, "Required fields missing");
  }

  // Validate role
  const allowedRoles = ["admin", "bloodbank", "user"];

  if (!allowedRoles.includes(role)) {
    throw new ApiError(400, "Invalid role selected");
  }

  // If bloodbank, license is required
  if (role === "bloodbank" && !licenseNumber) {
    throw new ApiError(400, "License number is required for blood banks");
  }

  // If bloodbank, pincode is required — it's what we geocode BankProfile.location from
  if (role === "bloodbank" && !pincode) {
    throw new ApiError(400, "Pincode is required for blood banks");
  }

  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }

  const user = await User.create({
    username,
    email,
    password,
    role,
    phone,
    pincode,
    licenseNumber: role === "bloodbank" ? licenseNumber : undefined
  });

  if (role === "bloodbank") {
    // Geocode at registration time so BankProfile.location (required field)
    // is populated immediately — bank is invisible to $geoNear until this exists.
    const { latitude, longitude } = await getCoordinatesFromPincode(pincode);

    const location = {
      type: "Point",
      coordinates: [longitude, latitude],
    };

    // Also written onto User for now — kept in sync during the migration
    // transition (Phase 1-5). Once controllers fully read from BankProfile
    // (Phase 6), these User-side geo fields can be dropped.
    user.latitude = latitude;
    user.longitude = longitude;
    user.location = location;
    await user.save({ validateBeforeSave: false });

    await BankProfile.create({
      userId: user._id,
      licenseNumber,
      pincode,
      location,
      // inventory defaults to all-zero via schema defaults
    });
  }

  if (role === "user") {
    const otp = generateOTP();
    user.emailVerificationOTP = otp;
    user.emailVerificationOTPExpiry = Date.now() + 10 * 60 * 1000; // 10 min
    await user.save({ validateBeforeSave: false });

    await sendEmail({
      to: user.email,
      subject: "BloodConnect - Verify your email",
      html: `<p>Your verification code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
    });
  }

  const createdUser = await User.findById(user._id)
    .select("-password -refreshToken");

  return res.status(201).json(
    new ApiResponse(
      201,
      createdUser,
      role === "bloodbank"
        ? "Blood Bank registered. Waiting for admin approval."
        : role === "user"
        ? "Registration successful. OTP sent to your email."
        : "User registered successfully"
    )
  );
});

const loginUser = asyncHandler(async (req, res) => {
  const { username, password, licenseNumber } = req.body;


  if (!password) {
  throw new ApiError(400, "Password is required");
}


let user;

if (licenseNumber) {
  // CHANGED: licenseNumber lives on BankProfile now, not User — resolve
  // through the profile, then load the actual auth-identity User.
  const bankProfile = await BankProfile.findOne({ licenseNumber });
  if (!bankProfile) {
    throw new ApiError(404, "User not found");
  }
  user = await User.findById(bankProfile.userId);
} else if (username) {
  user = await User.findOne({ username });
} else {
  throw new ApiError(400, "Username or License number required");
}
  
if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (user.role === "user" && !user.isEmailVerified) {
    throw new ApiError(403, "Please verify your email before logging in");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id,
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken",
  );

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  };


  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
          role: user.role,
          mode : user.mode
        },
        "Login successful",
      ),
    );
});

const verifyEmailOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isEmailVerified) {
    return res.status(200).json(new ApiResponse(200, {}, "Email already verified"));
  }

  if (!user.emailVerificationOTP || !user.emailVerificationOTPExpiry) {
    throw new ApiError(400, "No OTP requested. Please request a new one");
  }

  if (user.emailVerificationOTPExpiry < Date.now()) {
    throw new ApiError(400, "OTP has expired. Please request a new one");
  }

  if (user.emailVerificationOTP !== otp) {
    throw new ApiError(400, "Invalid OTP");
  }

  user.isEmailVerified = true;
  user.emailVerificationOTP = undefined;
  user.emailVerificationOTPExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  return res.status(200).json(new ApiResponse(200, {}, "Email verified successfully"));
});

const resendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.isEmailVerified) {
    return res.status(200).json(new ApiResponse(200, {}, "Email already verified"));
  }

  const otp = generateOTP();
  user.emailVerificationOTP = otp;
  user.emailVerificationOTPExpiry = Date.now() + 10 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  await sendEmail({
    to: user.email,
    subject: "BloodConnect - Verify your email",
    html: `<p>Your verification code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
  });

  return res.status(200).json(new ApiResponse(200, {}, "OTP resent successfully"));
});

const logoutUser = asyncHandler( async (req , res) =>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1 // this removes the field from document
            }
        },
        {
            new : true
        }
    )

    const options = {
        httpOnly: true,
        secure: true,
        maxAge: 3600000,
        SameSite: "None"
    }


    return res.status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(
        new ApiResponse(200, {},
        "User loggedOut Successfully"
        )
    )

})

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized Request");
  }

  try {
    // verify this token

    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );

    // to access user's info from db
    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Expired/Used refresh token");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id,
    );

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "Access token refreshed successfully",
        ),
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

export {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  verifyEmailOTP,
  resendOTP
};