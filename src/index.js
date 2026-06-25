import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { app } from "./app.js";

// DATABASE
import connectDB from "./db/index.js";


// Keep track of connections (important for serverless)
let isMongoConnected = false;

async function initConnections() {
  try {
    // MongoDB
    if (!isMongoConnected) {
      await connectDB();
      isMongoConnected = true;
      console.log("MongoDB connected ✅");
    }

    

  } catch (error) {
    console.error("Connection FAILED ❌", error);
  }
}

// Initialize once (cold start safe)
initConnections();

export default app;