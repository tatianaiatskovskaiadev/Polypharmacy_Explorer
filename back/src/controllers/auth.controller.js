import {createHash, timingSafeEqual} from 'crypto';
import config from '../configuration/config.js';
import {ForbiddenError} from '../utils/errors.js';
import {
    authenticateUser, createSession, createUser, deleteSession,
    SESSION_COOKIE_NAME, SESSION_DURATION_MS
} from '../services/auth.service.js';
import {getSessionToken} from '../middlewares/auth.middleware.js';

const cookieOptions = () => ({
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS
});

const matchesRegistrationCode = (value) => {
    if (!config.registrationCode || !value) return false;
    const expected = createHash('sha256').update(config.registrationCode).digest();
    const actual = createHash('sha256').update(value).digest();
    return timingSafeEqual(expected, actual);
};

const startSession = async (res, user) => {
    const {token, csrfToken} = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions());
    return res.set('Cache-Control', 'no-store').status(200).json({user, csrfToken});
};

export const register = async (req, res) => {
    if (!matchesRegistrationCode(req.body.registrationCode)) {
        throw new ForbiddenError('Invalid registration code');
    }
    const user = await createUser(req.body.email, req.body.password);
    return startSession(res, user);
};

export const login = async (req, res) => {
    const user = await authenticateUser(req.body.email, req.body.password);
    return startSession(res, user);
};

export const currentUser = (req, res) => res.set('Cache-Control', 'no-store').json({
    user: req.user,
    csrfToken: req.authSession.csrfToken
});

export const logout = async (req, res) => {
    await deleteSession(getSessionToken(req));
    const {maxAge, ...clearOptions} = cookieOptions();
    res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
    return res.status(204).end();
};
