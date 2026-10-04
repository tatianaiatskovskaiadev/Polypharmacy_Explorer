import {createHash, timingSafeEqual} from 'crypto';
import config from '../configuration/config.js';
import {ExternalServiceError, ForbiddenError} from '../utils/errors.js';
import {
    authenticateUser, createSession, createUser, deleteSession, listUserSessions, revokeUserSession,
    requestPasswordReset, resendVerificationEmail, resetPassword, sendVerificationEmail, verifyEmail,
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

const startSession = async (res, user, emailDeliveryFailed = false) => {
    const {token, csrfToken} = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions());
    return res.set('Cache-Control', 'no-store').status(200).json({user, csrfToken, ...(emailDeliveryFailed ? {emailDeliveryFailed} : {})});
};

export const register = async (req, res) => {
    if (!matchesRegistrationCode(req.body.registrationCode)) {
        throw new ForbiddenError('Invalid registration code');
    }
    const user = await createUser(req.body.email, req.body.password);
    let emailDeliveryFailed = false;
    try {
        await sendVerificationEmail(user);
    } catch (error) {
        if (!(error instanceof ExternalServiceError)) throw error;
        console.error('Verification email delivery failed');
        emailDeliveryFailed = true;
    }
    return startSession(res, user, emailDeliveryFailed);
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

export const getActiveSessions = async (req, res) => {
    const sessions = await listUserSessions(req.user.id, getSessionToken(req));
    return res.json({sessions});
};

export const revokeActiveSession = async (req, res) => {
    const current = await revokeUserSession(req.user.id, req.params.sessionId, getSessionToken(req));
    if (current) {
        const {maxAge, ...clearOptions} = cookieOptions();
        res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
    }
    return res.status(204).end();
};

export const confirmEmail = async (req, res) => {
    await verifyEmail(req.body.token);
    return res.status(204).end();
};

export const resendConfirmationEmail = async (req, res) => {
    await resendVerificationEmail(req.user.id);
    return res.status(202).json({message: 'If verification is needed, an email has been sent.'});
};

export const forgotPassword = async (req, res) => {
    try {
        await requestPasswordReset(req.body.email);
    } catch (error) {
        if (!(error instanceof ExternalServiceError)) throw error;
        console.error('Password reset email delivery failed');
    }
    return res.status(202).json({message: 'If an account exists, a password reset email has been sent.'});
};

export const confirmPasswordReset = async (req, res) => {
    await resetPassword(req.body.token, req.body.password);
    const {maxAge, ...clearOptions} = cookieOptions();
    res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
    return res.status(204).end();
};
