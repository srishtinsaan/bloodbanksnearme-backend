import { asyncHandler } from "../../src/utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {BloodBanks} from "../models/bloodbanks.model.js"

const fetchBloodBanksByPinCode = asyncHandler(async (req, res) => {
//   console.log("Headers:", req.headers)
//   console.log("Body:", req.body)
//   return res.json({ received: req.body })


    const {pincode} = req.body


    if(!pincode){
        throw new ApiError(400, "Pincode is required")
    }


    if (pincode.toString().length < 6) {
        throw new ApiError(400, "Pincode must be at least 6 digits");
    }

    if (pincode.toString().length > 6) {
        throw new ApiError(400, "Pincode must be of 6 digits");
    }
    
    if(isNaN(pincode)){
        throw new ApiError(400, "Pincode must be a number");
    }
    
    const banks = await BloodBanks.find(
        { 
            Pincode: Number(pincode),
        },
        { " Blood Bank Name": 1, 
            _id: 0,
            " Address" : 1,
            " State" : 1,
            " District" : 1,
            " City" : 1,
            " Address" : 1,
            " Contact No" : 1,
            " Mobile" : 1,
            " Category" : 1, 
            " Government" : 1,
            " Blood Component Available" : 1,
            " Apheresis" : 1,
            " Service Time" : 1,
            " Helpline" : 1,
            " Email" :1,
            " Website" : 1,


            " Nodal Officer" : 1,
            " Contact Nodal Officer" : 1,

            " Mobile Nodal Officer" : 1,
            " Email Nodal Officer" : 1,
            " Qualification Nodal Officer" : 1,

            " License #" : 1,
            " Date License Obtained" : 1,
            " Date of Renewal" : 1,

        }
    )

    // 332001 ... many blood banks at this pin code

    
    if (!banks || banks.length === 0) {
        throw new ApiError(404, "No blood banks found for this pincode")
    }

    return res.status(200).json(
        new ApiResponse(200, banks, "Blood banks fetched successfully")
    )

}

)


export {fetchBloodBanksByPinCode}
