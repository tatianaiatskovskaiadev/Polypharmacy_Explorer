import config from '../configuration/config.js';
import {CSRF_TOKEN_HEADER} from '../utils/constants.js';
import {ForbiddenError, UnauthorizedError} from '../utils/errors.js';
import {getSession, matchesCsrfToken, SESSION_COOKIE_NAME} from '../services/auth.service.js';

export const getSessionToken = (req) => req.headers.cookie?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === SESSION_COOKIE_NAME)?.[1];

export const requireAllowedOrigin = (req, res, next) => {
    const origin = req.get('origin');
    if ((origin && !config.corsOrigins.includes(origin)) ||
        (!origin && req.get('sec-fetch-site') === 'cross-site')) {
        return next(new ForbiddenError('Origin is not allowed'));
    }
    return next();
};

export const requireAuth = async (req, res, next) => {
    try {
        const session = await getSession(getSessionToken(req));
        if (!session?.userId) return next(new UnauthorizedError('Sign in required'));
        req.authSession = session;
        req.user = {
            id: String(session.userId._id),
            email: session.userId.email,
            emailVerified: session.userId.emailVerifiedAt !== null
        };
        res.set('Cache-Control', 'no-store');
        return next();
    } catch (error) {
        return next(error);
    }
};

export const requireVerifiedEmail = (req, res, next) => {
    if (!req.user.emailVerified) return next(new ForbiddenError('Verify your email before using this endpoint'));
    return next();
};

export const requireCsrf = (req, res, next) => {
    if (!matchesCsrfToken(req.authSession, req.get(CSRF_TOKEN_HEADER))) {
        return next(new ForbiddenError('Invalid CSRF token'));
    }
    return next();
};
