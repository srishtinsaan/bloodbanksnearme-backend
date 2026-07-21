// utils/redisClient.js
import { Redis } from "@upstash/redis";

// REST-based client — serverless-friendly, koi persistent connection nahi
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});