import mongoose from 'mongoose';
import {User} from '../models/User.model.js';
import {Session} from '../models/Session.model.js';
import {AuthToken} from '../models/AuthToken.model.js';
import {MailJob} from '../../mail/models/MailJob.model.js';

export const runTransaction = (callback) => mongoose.connection.transaction(callback);

export const createUser = async (data, session) => (
    session ? (await User.create([data], {session}))[0] : await User.create(data)
);
export const findUserByEmail = (email, withPassword = false) => (
    withPassword ? User.findOne({email}).select('+passwordHash') : User.findOne({email})
);
export const findUserById = (userId) => User.findById(userId);
export const updateUser = (userId, fields) => User.updateOne({_id: userId}, {$set: fields});
export const userExists = (email) => User.exists({email});

export const createSession = (data) => Session.create(data);
export const findActiveSession = (tokenHash, now) => (
    Session.findOne({tokenHash, expiresAt: {$gt: now}}).populate('userId')
);
export const deleteSession = (tokenHash) => Session.deleteOne({tokenHash});
export const listActiveSessions = (userId, now) => (
    Session.find({userId, expiresAt: {$gt: now}})
        .select('_id tokenHash createdAt expiresAt')
        .sort({createdAt: -1})
        .lean()
);
export const revokeSession = (userId, sessionId) => Session.findOneAndDelete({_id: sessionId, userId});
export const deleteUserSessions = (userId) => Session.deleteMany({userId});

export const consumeAuthToken = (purpose, tokenHash, now) => AuthToken.findOneAndDelete({
    purpose, tokenHash, expiresAt: {$gt: now}
});
export const deleteAuthTokens = (userId, purpose) => AuthToken.deleteMany({userId, purpose});
export const cancelPendingResetJobs = (userId) => MailJob.updateMany(
    {userId, purpose: 'reset-password', state: 'pending'}, {$set: {state: 'failed'}}
);
