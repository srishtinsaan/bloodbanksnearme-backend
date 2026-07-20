import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
  if (global.mongoose?.conn) {
    return global.mongoose.conn;
  }

  if (!global.mongoose) {
    global.mongoose = { conn: null, promise: null };
  }

  if (!global.mongoose.promise) {
    global.mongoose.promise = mongoose
      .connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
      .then(async (mongooseInstance) => {
        console.log("MongoDB connected !! DB HOST :", mongooseInstance.connection.host);

        // warmup: pay TLS/pool cost here, not on the user's first real query
        const warmStart = Date.now();
        await mongooseInstance.connection.db
          .collection("bloodbanks")
          .findOne({}, { projection: { _id: 1 } });
        console.log(`Connection warmed up in ${Date.now() - warmStart}ms`);

        return mongooseInstance;
      });
  }

  global.mongoose.conn = await global.mongoose.promise;
  return global.mongoose.conn;
};

export default connectDB;