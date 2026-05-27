// middlewares/authorizeRoles.js

import { ApiError } from "../utils/ApiError.js";

export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {

        if (!req.user || !allowedRoles.includes(req.user.mode)) {
            return next(
                new ApiError(403, "Access denied : invalid mode")
            );
        }

        next();
    };
};