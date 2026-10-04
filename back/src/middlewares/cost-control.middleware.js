import {
    EXPENSIVE_ENDPOINT_RATE_LIMIT_MAX_REQUESTS,
    EXPENSIVE_ENDPOINT_RATE_LIMIT_WINDOW_MS
} from "../utils/constants.js";
import {TooManyRequestsError} from "../utils/errors.js";

const requestBuckets = new Map();
const authBuckets = new Map();

const getClientKey = (req) => (
    `${req.user.id}:${req.method}:${req.originalUrl || req.path}`
);

const enforceRateLimit = (req, next) => {
    const now = Date.now();
    const key = getClientKey(req);
    const bucket = requestBuckets.get(key);

    if (!bucket || bucket.expiresAt <= now) {
        requestBuckets.set(key, {
            count: 1,
            expiresAt: now + EXPENSIVE_ENDPOINT_RATE_LIMIT_WINDOW_MS
        });
        return true;
    }

    bucket.count++;
    if (bucket.count > EXPENSIVE_ENDPOINT_RATE_LIMIT_MAX_REQUESTS) {
        next(new TooManyRequestsError('Rate limit exceeded for expensive endpoint'));
        return false;
    }

    return true;
};

export const protectExpensiveEndpoint = (req, res, next) => {
    if (!enforceRateLimit(req, next)) {
        return;
    }

    next();
};

export const protectAuthEndpoint = (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const bucket = authBuckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
        authBuckets.set(key, {count: 1, expiresAt: now + 15 * 60 * 1000});
        return next();
    }
    bucket.count++;
    if (bucket.count > 10) return next(new TooManyRequestsError('Too many sign-in attempts'));
    return next();
};
