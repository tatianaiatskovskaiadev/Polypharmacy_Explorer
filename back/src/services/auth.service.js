import {createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual} from 'crypto';
import {promisify} from 'util';
import {User} from '../models/User.model.js';
import {Session} from '../models/Session.model.js';
import {AuthToken} from '../models/AuthToken.model.js';
import {sendActionEmail} from './mail.service.js';
import {BadRequestError, ConflictError, UnauthorizedError} from '../utils/errors.js';

const scrypt = promisify(scryptCallback);
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'pe_session';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const normalizeEmail = (email) => email.trim().toLowerCase();
const publicUser = (user) => ({
    id: String(user._id),
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null
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

export const createUser = async (email, password) => {
    try {
        const user = await User.create({email: normalizeEmail(email), passwordHash: await hashPassword(password), emailVerifiedAt: null});
        return publicUser(user);
    } catch (error) {
        if (error.code === 11000) throw new ConflictError('An account with this email already exists');
        throw error;
    }
};

export const authenticateUser = async (email, password) => {
    const user = await User.findOne({email: normalizeEmail(email)}).select('+passwordHash');
    if (!user || !await verifyPassword(password, user.passwordHash)) {
        throw new UnauthorizedError('Invalid email or password');
    }
    return publicUser(user);
};

export const createSession = async (userId) => {
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    await Session.create({
        userId,
        tokenHash: digest(token),
        csrfToken,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS)
    });
    return {token, csrfToken};
};

export const getSession = async (token) => {
    if (!/^[a-f0-9]{64}$/i.test(token ?? '')) return null;
    return Session.findOne({tokenHash: digest(token), expiresAt: {$gt: new Date()}}).populate('userId');
};

export const deleteSession = async (token) => {
    if (/^[a-f0-9]{64}$/i.test(token ?? '')) {
        await Session.deleteOne({tokenHash: digest(token)});
    }
};

export const listUserSessions = async (userId, currentToken) => {
    const currentTokenHash = digest(currentToken);
    const sessions = await Session.find({userId, expiresAt: {$gt: new Date()}})
        .select('_id tokenHash createdAt expiresAt')
        .sort({createdAt: -1})
        .lean();
    return sessions.map((session) => ({
        id: String(session._id),
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        current: session.tokenHash === currentTokenHash
    }));
};

export const revokeUserSession = async (userId, sessionId, currentToken) => {
    const session = await Session.findOneAndDelete({_id: sessionId, userId});
    return session?.tokenHash === digest(currentToken);
};

export const matchesCsrfToken = (session, token) => {
    if (!/^[a-f0-9]{64}$/i.test(token ?? '')) return false;
    return timingSafeEqual(Buffer.from(session.csrfToken, 'hex'), Buffer.from(token, 'hex'));
};

const issueActionToken = async (user, purpose) => {
    const token = randomBytes(32).toString('hex');
    const durationMs = purpose === 'verify-email' ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000;
    await AuthToken.deleteMany({userId: user.id, purpose});
    await AuthToken.create({
        userId: user.id,
        purpose,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + durationMs)
    });
    await sendActionEmail(user.email, purpose, token);
};

export const sendVerificationEmail = async (user) => {
    if (!user.emailVerified) await issueActionToken(user, 'verify-email');
};

export const resendVerificationEmail = async (userId) => {
    const user = await User.findById(userId);
    if (user) await sendVerificationEmail(publicUser(user));
};

export const verifyEmail = async (token) => {
    const action = await AuthToken.findOneAndDelete({
        purpose: 'verify-email', tokenHash: digest(token), expiresAt: {$gt: new Date()}
    });
    if (!action) throw new BadRequestError('Invalid or expired verification link');
    await User.updateOne({_id: action.userId}, {$set: {emailVerifiedAt: new Date()}});
};

export const requestPasswordReset = async (email) => {
    const user = await User.findOne({email: normalizeEmail(email)});
    if (user) await issueActionToken(publicUser(user), 'reset-password');
};

export const resetPassword = async (token, password) => {
    const action = await AuthToken.findOneAndDelete({
        purpose: 'reset-password', tokenHash: digest(token), expiresAt: {$gt: new Date()}
    });
    if (!action) throw new BadRequestError('Invalid or expired password reset link');
    await User.updateOne({_id: action.userId}, {$set: {passwordHash: await hashPassword(password)}});
    await Session.deleteMany({userId: action.userId});
    await AuthToken.deleteMany({userId: action.userId, purpose: 'reset-password'});
};
