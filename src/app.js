import express from "express"
import cors from "cors"
import userRouter from "./routes/user.routes.js"
import bloodbankRoutes from "./routes/bloodbank.routes.js";
import { ApiError } from "./utils/ApiError.js"
import cookieParser from "cookie-parser"
import adminRouter from "./routes/admin.routes.js";

import "./jobs/cleanupRequests.js";

// import { verifyJWT } from "../middlewares/auth.middleware.js";
// import { authorizeRoles } from "../middlewares/authorizeRoles.js";



import connectDB from "./db/index.js";

const app = express();

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

const allowedOrigins = [
  process.env.LOCAL_DEV,
  process.env.DEPLOYED_ORIGIN_ONE,
  process.env.DEPLOYED_ORIGIN_TWO
];

app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true);
    if(allowedOrigins.includes(origin)){
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// 👇 yahan add kar — DB connection ready, uske baad hi koi route hit ho
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/hello123", (req, res) => {
  res.send("HELLO123");
});

app.get("/", (req, res) => {
  res.send("Backend is running!");
});

app.use("/api/v1", userRouter);
app.use("/api/v1/bloodbanks", bloodbankRoutes);
app.use("/api/v1/admin", adminRouter);



app.get("/api/debug", (req, res) => {
  res.send("debug works");
});


// error handling:-

app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors || [],
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }

  return res.status(500).json({
    success: false,
    statusCode: 500,
    message: err.message || "Something went wrong",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});





export {app}
