import express from "express"
import cors from "cors"
import userRouter from "./routes/user.routes.js"
import { ApiError } from "./utils/ApiError.js"
import cookieParser from "cookie-parser"

// import { verifyJWT } from "../middlewares/auth.middleware.js";
// import { authorizeRoles } from "../middlewares/authorizeRoles.js";



const app = express()

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

const allowedOrigins = [
  process.env.LOCAL_DEV, // local dev
  process.env.DEPLOYED_ORIGIN_ONE,
  process.env.DEPLOYED_ORIGIN_TWO // deployed frontend
];


app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true); // allow non-browser requests like Postman
    if(allowedOrigins.includes(origin)){
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // allow cookies/auth headers
}));

app.use(express.json({ limit: "16kb" }))
app.use(express.urlencoded({ extended: true, limit: "16kb" })) //Prevents large payload attacks

app.use(cookieParser())



app.get("/", (req, res) => {
  res.send("Backend is running!");
});

app.use("/api", userRouter)





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
