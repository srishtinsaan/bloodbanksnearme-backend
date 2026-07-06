// scripts/verifyAllBanks.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../src/models/user.model.js"; // adjust path if needed
import { DB_NAME } from "./constants.js";

dotenv.config();

const run = async () => {
  try {
  await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);

    console.log("Connected to DB");

    const totalBanks = await User.countDocuments({ role: "bloodbank" });
    const unverifiedCount = await User.countDocuments({
      role: "bloodbank",
      isApproved: false,
    });

    console.log(`Total bloodbank accounts: ${totalBanks}`);
    console.log(`Currently unverified: ${unverifiedCount}`);

    const sample = await User.find({ role: "bloodbank", isApproved: false })
      .limit(5)
      .select("username email licenseNumber pincode createdAt")
      .lean();

    console.log("\nSample of unverified accounts:");
    console.log(JSON.stringify(sample, null, 2));

    // ── Uncomment once the sample above looks correct ──
    /*
    const result = await User.updateMany(
      { role: "bloodbank" },
      { $set: { isApproved: true } }
    );
    console.log(`\nMatched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    */

    console.log("\nDry run only — uncomment the updateMany block to actually approve all banks.");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};

run();