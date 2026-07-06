// models/pincodeCache.model.js
import mongoose from "mongoose";

const pincodeCacheSchema = new mongoose.Schema(
  {
    pincode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

export const PincodeCache = mongoose.model("PincodeCache", pincodeCacheSchema);