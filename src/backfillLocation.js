// scripts/backfillLocation.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import { BloodBanks } from "../src/models/bloodbanks.model.js";
import { DB_NAME } from "../src/constants.js"; // apna actual path daal

dotenv.config();

async function backfillLocation() {
  await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
  console.log("Connected to DB");

  const totalEligible = await BloodBanks.countDocuments({
    latitude: { $ne: null, $exists: true },
    longitude: { $ne: null, $exists: true },
    location: { $exists: false },
  });
  console.log(`Eligible banks to backfill: ${totalEligible}`);

  const result = await BloodBanks.updateMany(
    {
      latitude: { $ne: null, $exists: true },
      longitude: { $ne: null, $exists: true },
      location: { $exists: false },
    },
    [
      {
        $set: {
          location: {
            type: "Point",
            coordinates: ["$longitude", "$latitude"],
          },
        },
      },
    ]
  );
  console.log(`Modified: ${result.modifiedCount}`);

  const badDocs = await BloodBanks.find({
    location: { $exists: true },
    $or: [
      { "location.coordinates.0": { $lt: -180 } },
      { "location.coordinates.0": { $gt: 180 } },
      { "location.coordinates.1": { $lt: -90 } },
      { "location.coordinates.1": { $gt: 90 } },
    ],
  }).lean();

  if (badDocs.length > 0) {
    console.log(`WARNING: ${badDocs.length} docs have out-of-range coordinates:`);
    console.log(badDocs.map((d) => ({ _id: d._id, coords: d.location.coordinates })));
  } else {
    console.log("All coordinates within valid range.");
  }

  // index yahan nahi banate — schema declaration (bloodbanksSchema.index({ location: "2dsphere" }))
  // Mongoose connect hote hi (ya syncIndexes() call pe) khud bana lega

  const withLocation = await BloodBanks.countDocuments({ location: { $exists: true } });
  const withoutLocation = await BloodBanks.countDocuments({
    latitude: { $ne: null, $exists: true },
    longitude: { $ne: null, $exists: true },
    location: { $exists: false },
  });
     console.log(`Total with location: ${withLocation}`);
  console.log(`Remaining without location: ${withoutLocation}`);

  await mongoose.disconnect();
  console.log("Disconnected from DB");
}

backfillLocation().catch(async (err) => {
  console.error("Backfill failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});