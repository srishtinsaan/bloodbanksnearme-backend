import cron from "node-cron";
import { BloodRequest } from "../models/bloodRequest.model.js";

// Har roz midnight pe chalega
cron.schedule("0 0 * * *", async () => {
  try {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 din purane
    const result = await BloodRequest.deleteMany({
      createdAt: { $lt: cutoffDate }
    });
    console.log(`✅ Cleanup done. Deleted: ${result.deletedCount} old requests`);
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
  }
});