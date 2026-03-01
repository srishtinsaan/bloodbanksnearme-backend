import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: [true, "Password is required"]
    },

    role: {
      type: String,
      enum: ["admin", "bloodbank", "donor", "recipient"],
      required: true
    },

    phone: {
      type: String,
      trim: true
    },

    pincode: {
      type: String,
      trim: true
    },

    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]
    },

    // Only required for blood banks
    licenseNumber: {
      type: String,
      required: function () {
        return this.role === "bloodbank";
      }
    },

    // Blood banks must be approved by admin
    isApproved: {
      type: Boolean,
      default: function () {
        return this.role === "bloodbank" ? false : true;
      }
    },

    refreshToken: {
      type: String
    }
  },
  { timestamps: true }
);


userSchema.pre("save", async function(next){
    if(this.isModified("password")){
        this.password = await bcrypt.hash(this.password, 10)
        next()
    }else{
        return next()
    }
})

userSchema.methods.isPasswordCorrect = async function(password){
    return await bcrypt.compare(password, this.password)
}

userSchema.methods.generateAccessToken = function(){ // sign is a sync function not async function
    return jwt.sign(
        //payload
        {
            _id : this._id,
            email: this.email,
            role: this.role
            

        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn : process.env.ACCESS_TOKEN_EXPIRY
        }
    )
}
userSchema.methods.generateRefreshToken = function(){
    return jwt.sign(
        //payload
        { _id : this._id }, 
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn : process.env.REFRESH_TOKEN_EXPIRY }
    )
}


export const User = mongoose.model("User", userSchema)