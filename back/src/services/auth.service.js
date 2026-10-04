import {createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual} from 'crypto';
import {promisify} from 'util';
import {User} from '../models/User.model.js';
import {Session} from '../models/Session.model.js';
import {ConflictError, UnauthorizedError} from '../utils/errors.js';

const scrypt = promisify(scryptCallback);
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'pe_session';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const normalizeEmail = (email) => email.trim().toLowerCase();
const publicUser = (user) => ({id: String(user._id), email: user.email});

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
        const user = await User.create({email: normalizeEmail(email), passwordHash: await hashPassword(password)});
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

export const matchesCsrfToken = (session, token) => {
    if (!/^[a-f0-9]{64}$/i.test(token ?? '')) return false;
    return timingSafeEqual(Buffer.from(session.csrfToken, 'hex'), Buffer.from(token, 'hex'));
};
