import config from '../../../configuration/config.js';
import {logEvent} from '../../../utils/logging.js';
import {
    authenticateUser, createSession, deleteSession, listUserSessions, revokeUserSession,
    requestPasswordReset, resendVerificationEmail, resetPassword, verifyEmail,
    SESSION_COOKIE_NAME, SESSION_DURATION_MS
} from '../services/auth.service.js';
import {getSessionToken} from '../middlewares/auth.middleware.js';
import {registerAccount} from '../services/registration.service.js';

const cookieOptions = () => ({
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS
});

const startSession = async (res, user) => {
    const {token, csrfToken} = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions());
    return res.set('Cache-Control', 'no-store').status(200).json({user, csrfToken});
};

export const register = async (req, res) => {
    const {email, password, registrationCode} = req.body;
    const user = await registerAccount(email, password, registrationCode);
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
    return res.status(202).json({message: 'If verification is needed, an email has been requested.'});
};

export const forgotPassword = async (req, res) => {
    try {
        await requestPasswordReset(req.body.email);
    } catch {
        logEvent('error', 'password_reset_enqueue_failed', {requestId: req.requestId});
    }
    return res.status(202).json({message: 'If an account exists, a password reset email has been requested.'});
};

export const confirmPasswordReset = async (req, res) => {
    await resetPassword(req.body.token, req.body.password);
    const {maxAge, ...clearOptions} = cookieOptions();
    res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
    return res.status(204).end();
};
