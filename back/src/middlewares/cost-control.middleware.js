import config from "../configuration/config.js";
import {
    EXPENSIVE_ENDPOINT_RATE_LIMIT_MAX_REQUESTS,
    EXPENSIVE_ENDPOINT_RATE_LIMIT_WINDOW_MS
} from "../utils/constants.js";
import {TooManyRequestsError, UnauthorizedError} from "../utils/errors.js";

const requestBuckets = new Map();

const getClientKey = (req) => (
    `${req.ip || req.socket?.remoteAddress || 'unknown'}:${req.method}:${req.originalUrl || req.path}`
);

const enforceDemoApiKey = (req, next) => {
    if (!config.demoApiKey) {
        return true;
    }

    if (req.get('x-demo-api-key') === config.demoApiKey) {
        return true;
    }

    next(new UnauthorizedError('Missing or invalid demo API key'));
    return false;
};

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
    if (!enforceDemoApiKey(req, next)) {
        return;
    }

    if (!enforceRateLimit(req, next)) {
        return;
    }

    next();
};
