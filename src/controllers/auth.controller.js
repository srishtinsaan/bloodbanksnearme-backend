import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";



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
  const allowedRoles = ["admin", "bloodbank", "donor", "recipient"];

  if (!allowedRoles.includes(role)) {
    throw new ApiError(400, "Invalid role selected");
  }

  // If bloodbank, license is required
  if (role === "bloodbank" && !licenseNumber) {
    throw new ApiError(400, "License number is required for blood banks");
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
    bloodGroup: role === "donor" ? bloodGroup : undefined,
    licenseNumber: role === "bloodbank" ? licenseNumber : undefined
  });

  const createdUser = await User.findById(user._id)
    .select("-password -refreshToken");

  return res.status(201).json(
    new ApiResponse(
      201,
      createdUser,
      role === "bloodbank"
        ? "Blood Bank registered. Waiting for admin approval."
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
  user = await User.findOne({ licenseNumber, role: "bloodbank" });
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
          role: user.role, // ✅ frontend will redirect based on this
        },
        "Login successful",
      ),
    );
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
  logoutUser
};
