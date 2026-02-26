// middlewares/authorizeRoles.js

import { ApiError } from "../utils/ApiError.js";

export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {

        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return next(
                new ApiError(403, "Access denied")
            );
        }

        next();
    };
};