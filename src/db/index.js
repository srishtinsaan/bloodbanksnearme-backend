import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

let cached = global.mongooseConnection;

if (!cached) {
  cached = global.mongooseConnection = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    console.log("MongoDB: using cached connection");
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(`${process.env.MONGODB_URI}/${DB_NAME}`, {
        bufferCommands: false,
      })
      .then((mongooseInstance) => {
        console.log(
          `\n MongoDB connected !! DB HOST : ${mongooseInstance.connection.host}`
        );
        return mongooseInstance;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.log("MongoDB connection error ::", error);
    throw error;
  }

  return cached.conn;
};

export default connectDB;