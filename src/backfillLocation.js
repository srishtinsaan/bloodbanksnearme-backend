// scripts/sweepStaleTerminalRequests.js
//
// Standalone runner for the same soft-delete sweep that fires lazily inside
// the app (utils/staleRequestCleanup.js -> sweepStaleTerminalRequests).
// Use this to test/verify the logic directly against real data, or to run
// a manual cleanup pass without needing to hit a list endpoint first.
//
// Soft delete only — never removes documents, only sets isDeleted/deletedAt
// on requests that have been sitting in a terminal status (fulfilled/
// rejected/cancelled) for longer than the threshold. Never touches
// pending/assigned/accepted requests, regardless of age.
//
// Dry run by default. Pass --confirm to write.
// Optional: --days=<N> to override the 30-day default threshold.

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { BloodRequest } from "../src/models/bloodRequest.model.js"; // apna actual path daal
import { DonationRequest } from "../src/models/donationRequest.model.js"; // apna actual path daal
import { DB_NAME } from "../src/constants.js"; // apna actual path daal

dotenv.config();

const CONFIRM = process.argv.includes("--confirm");

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const THRESHOLD_DAYS = daysArg ? Number(daysArg.split("=")[1]) : 30;

const TERMINAL_STATUSES = ["fulfilled", "rejected", "cancelled"];

async function sweepOne(Model, label) {
  const cutoff = new Date(Date.now() - THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  const query = {
    status: { $in: TERMINAL_STATUSES },
    isDeleted: { $ne: true }, // matches false AND missing (pre-schema-change docs)
    updatedAt: { $lt: cutoff },
  };

  const matches = await Model.find(query)
    .select("_id status updatedAt username bankName bloodGroup bloodType")
    .lean();

  console.log(`\n=== ${label} ===`);
  console.log(`Threshold: ${THRESHOLD_DAYS} days (cutoff: ${cutoff.toISOString()})`);
  console.log(`Matching terminal + stale + not-yet-deleted: ${matches.length}`);

  const statusBreakdown = matches.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});
  console.log("By status:", statusBreakdown);

  const PREVIEW_COUNT = Math.min(5, matches.length);
  if (PREVIEW_COUNT > 0) {
    console.log(`\nSample (${PREVIEW_COUNT}):`);
    for (let i = 0; i < PREVIEW_COUNT; i++) {
      const m = matches[i];
      console.log(
        `  - _id=${m._id} status=${m.status} updatedAt=${m.updatedAt.toISOString()} (${
          m.username || ""
        })`
      );
    }
  }

  return { query, matches };
}

async function run() {
  await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
  console.log("Connected to DB");
  console.log(CONFIRM ? "MODE: LIVE (will set isDeleted/deletedAt)" : "MODE: DRY RUN");

  const bloodResult = await sweepOne(BloodRequest, "BloodRequest");
  const donationResult = await sweepOne(DonationRequest, "DonationRequest");

  const totalMatches = bloodResult.matches.length + donationResult.matches.length;

  if (totalMatches === 0) {
    console.log("\nNothing to sweep. Nothing else to do.");
    await mongoose.disconnect();
    return;
  }

  // Backup matched docs before touching anything
  const backupDir = path.resolve("./backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(
    path.join(backupDir, `staleRequestSweep_${stamp}.json`),
    JSON.stringify(
      { bloodRequests: bloodResult.matches, donationRequests: donationResult.matches },
      null,
      2
    )
  );
  console.log(`\nMatched docs backed up to ./backups/staleRequestSweep_${stamp}.json`);

  if (!CONFIRM) {
    console.log(
      `\nDry run complete. Would soft-delete ${bloodResult.matches.length} BloodRequest + ` +
        `${donationResult.matches.length} DonationRequest docs.\nRe-run with --confirm to apply.`
    );
    await mongoose.disconnect();
    return;
  }

  const bloodUpdate = await BloodRequest.updateMany(bloodResult.query, {
    $set: { isDeleted: true, deletedAt: new Date() },
  });
  console.log(
    `\nBloodRequest: matched ${bloodUpdate.matchedCount}, modified ${bloodUpdate.modifiedCount}`
  );

  const donationUpdate = await DonationRequest.updateMany(donationResult.query, {
    $set: { isDeleted: true, deletedAt: new Date() },
  });
  console.log(
    `DonationRequest: matched ${donationUpdate.matchedCount}, modified ${donationUpdate.modifiedCount}`
  );

  await mongoose.disconnect();
  console.log("Disconnected from DB");
}

run().catch(async (err) => {
  console.error("Sweep run failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});