import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { app } from "./app.js";

// DATABASE
import connectDB from "./db/index.js";

// REDIS
import { connectRedis } from "./config/redis.js";

// Keep track of connections (important for serverless)
let isMongoConnected = false;
let isRedisConnected = false;

async function initConnections() {
  try {
    // MongoDB
    if (!isMongoConnected) {
      await connectDB();
      isMongoConnected = true;
      console.log("MongoDB connected ✅");
    }

    // Redis
    if (!isRedisConnected) {
      await connectRedis();
      isRedisConnected = true;
      console.log("Redis initialized ✅");
    }

  } catch (error) {
    console.error("Connection FAILED ❌", error);
  }
}

// Initialize once (cold start safe)
initConnections();

export default app;