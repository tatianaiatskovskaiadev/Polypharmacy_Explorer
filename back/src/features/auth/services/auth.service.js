import {createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual} from 'crypto';
import {promisify} from 'util';
import * as authRepository from '../repository/auth.repository.js';
import {queueActionEmail} from '../../mail/services/mail-queue.service.js';
import {BadRequestError, ConflictError, UnauthorizedError} from '../../../utils/errors.js';

const scrypt = promisify(scryptCallback);
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'pe_session';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const normalizeEmail = (email) => email.trim().toLowerCase();
const publicUser = (user) => ({
    id: String(user._id),
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role === 'admin' ? 'admin' : 'user'
});

const hashPassword = async (password) => {
    const salt = randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64);
    return `${salt}:${hash.toString('hex')}`;
};

const verifyPassword = async (password, stored) => {
    const [salt, hexHash] = stored.split(':');
    if (!salt || !hexHash || !/^[a-f0-9]{128}$/i.test(hexHash)) return false;
    const expected = Buffer.from(hexHash, 'hex');
    const actual = await scrypt(password, salt, expected.length);
    return timingSafeEqual(expected, actual);
};

export const createUser = async (email, password, session) => {
    try {
        const data = {
            email: normalizeEmail(email), passwordHash: await hashPassword(password),
            emailVerifiedAt: null, role: 'user'
        };
        const user = await authRepository.createUser(data, session);
        return publicUser(user);
    } catch (error) {
        if (error.code === 11000) throw new ConflictError('An account with this email already exists');
        throw error;
    }
};

export const authenticateUser = async (email, password) => {
    const user = await authRepository.findUserByEmail(normalizeEmail(email), true);
    if (!user || !await verifyPassword(password, user.passwordHash)) {
        throw new UnauthorizedError('Invalid email or password');
    }
    return publicUser(user);
};

export const createSession = async (userId) => {
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    await authRepository.createSession({
        userId,
        tokenHash: digest(token),
        csrfToken,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS)
    });
    return {token, csrfToken};
};

export const getSession = async (token) => {
    if (!/^[a-f0-9]{64}$/i.test(token ?? '')) return null;
    return authRepository.findActiveSession(digest(token), new Date());
};

export const deleteSession = async (token) => {
    if (/^[a-f0-9]{64}$/i.test(token ?? '')) {
        await authRepository.deleteSession(digest(token));
    }
};

export const listUserSessions = async (userId, currentToken) => {
    const currentTokenHash = digest(currentToken);
    const sessions = await authRepository.listActiveSessions(userId, new Date());
    return sessions.map((session) => ({
        id: String(session._id),
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        current: session.tokenHash === currentTokenHash
    }));
};

export const revokeUserSession = async (userId, sessionId, currentToken) => {
    const session = await authRepository.revokeSession(userId, sessionId);
    return session?.tokenHash === digest(currentToken);
};

export const matchesCsrfToken = (session, token) => {
    if (!/^[a-f0-9]{64}$/i.test(token ?? '')) return false;
    return timingSafeEqual(Buffer.from(session.csrfToken, 'hex'), Buffer.from(token, 'hex'));
};

export const sendVerificationEmail = async (user, session) => {
    if (!user.emailVerified) await queueActionEmail(user.id, 'verify-email', session);
};

export const resendVerificationEmail = async (userId) => {
    const user = await authRepository.findUserById(userId);
    if (user) await sendVerificationEmail(publicUser(user));
};

export const verifyEmail = async (token) => {
    const action = await authRepository.consumeAuthToken('verify-email', digest(token), new Date());
    if (!action) throw new BadRequestError('Invalid or expired verification link');
    await authRepository.updateUser(action.userId, {emailVerifiedAt: new Date()});
    await authRepository.deleteAuthTokens(action.userId, 'verify-email');
};

export const requestPasswordReset = async (email) => {
    const user = await authRepository.findUserByEmail(normalizeEmail(email));
    if (user) await queueActionEmail(user._id, 'reset-password');
};

export const resetPassword = async (token, password) => {
    const action = await authRepository.consumeAuthToken('reset-password', digest(token), new Date());
    if (!action) throw new BadRequestError('Invalid or expired password reset link');
    await authRepository.updateUser(action.userId, {passwordHash: await hashPassword(password)});
    await authRepository.deleteUserSessions(action.userId);
    await authRepository.cancelPendingResetJobs(action.userId);
    await authRepository.deleteAuthTokens(action.userId, 'reset-password');
};
