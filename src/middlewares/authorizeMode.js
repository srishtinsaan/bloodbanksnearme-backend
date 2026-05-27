// middlewares/authorizeMode.js
import { ApiError } from "../utils/ApiError.js";

export const authorizeMode = (...allowedModes) => {
    return (req, res, next) => {
        if (!req.user || !allowedModes.includes(req.user.mode)) {
            return next(
                new ApiError(403, "Access denied: invalid mode")
            );
        }
        next();
    };
};