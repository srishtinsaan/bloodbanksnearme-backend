import mongoose, { Schema } from "mongoose";

const donorSchema = new Schema({
    fullName: {
        type: String,
        required: true
    },
    age: {
        type: Number,
        required: true
    },
    gender: {
        type: String,
        enum: ["Male", "Female", "Other"]
    },
    bloodGroup: {
        type: String,
        enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
    },
    phoneNumber: {
        type: String,
        required: true
    },
    email: {
        type: String
    },
    city: {
        type: String
    },
    medicalConditions: {
        type: String
    },
    registrationDate: {
        type: Date,
        default: Date.now
    }
});

export const Donor = mongoose.model("Donor", donorSchema)