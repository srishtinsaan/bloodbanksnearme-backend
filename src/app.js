import express from "express"
import cors from "cors"
import userRouter from "./routes/user.routes.js"
import { ApiError } from "./utils/ApiError.js"




const app = express()

app.use(cors({ 
    origin:process.env.CORS_ORIGIN
}))

app.use(express.json())

app.use(express.urlencoded({ 
    extended: true 
}))





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
