import { Router } from "express";
import { fetchBloodBanksByPinCode } from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { loginUser, registerUser, logoutUser, refreshAccessToken } from "../controllers/auth.controller.js";



const router = Router();

router.route("/bloodbanks").post(fetchBloodBanksByPinCode)

router.post("/register", registerUser)

router.post("/login", loginUser)

// secured routes : those routes that are given to user only when she's logged in

router.route("/logout").post(verifyJWT, logoutUser)

router.route("/refresh-token").post(refreshAccessToken)

export default router
