import connectDB from "./db/index.js";
import dotenv from "dotenv";
import { app } from "./app.js";

dotenv.config({ path: "../.env" });

// Keep track of DB connection to avoid reconnecting on every request
let isConnected = false;

async function initDB() {
  if (!isConnected) {
    try {
      await connectDB();
      isConnected = true;
      console.log("MongoDB connected ✅");
    } catch (error) {
      console.error("MONGODB Connection FAILED !!!", error);
    }
  }
}

// Initialize DB once (serverless cold start)
initDB();

export default app;
