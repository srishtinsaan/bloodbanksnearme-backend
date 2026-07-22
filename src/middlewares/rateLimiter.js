// middlewares/rateLimiter.js
import rateLimit from "express-rate-limit";

// Login/register jaise sensitive auth endpoints ke liye —
// sakht limit, kyunki ye brute-force ka target hote hain
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute ka window
  max: 5, // is window mein max 5 attempts per IP
  message: {
    success: false,
    message: "Too many attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true, // response headers mein rate-limit info bhejo (frontend ke liye useful)
  legacyHeaders: false,
});