import mongoose from 'mongoose';
import ApiError from '../utils/errors.js';

const errorResponse = (res, req, status, error, message) => res.status(status).json({
    "timestamp": new Date().toISOString(),
    "status": status,
    "error": error,
    "message": message,
    "path": req.path
});

const errorHandler = (err, req, res, next) => {
    if (!(err instanceof ApiError) || err.statusCode >= 500) console.error(err.stack);

    if (err instanceof ApiError) {
        return errorResponse(res, req, err.statusCode, err.name, err.message);
    }

    if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError) {
        return errorResponse(res, req, 400, 'Bad Request', err.message);
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue);
        const value = Object.values(err.keyValue);
        return errorResponse(res, req, 409, 'Conflict', `A record with the value '${value}' for the field '${field}' already exists.`);
    }

    return errorResponse(res, req, 500, 'Internal Server Error', 'An unexpected error occurred. Please try again later.');
}

export default errorHandler;
