import {createHash, randomBytes} from 'crypto';
import {Invitation} from '../models/Invitation.model.js';
import {ForbiddenError} from '../utils/errors.js';

export const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeEmail = (email) => email.trim().toLowerCase();
const digest = (value) => createHash('sha256').update(value).digest('hex');

export const issueInvitation = async (email) => {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_DURATION_MS);
    await Invitation.create({email: normalizeEmail(email), tokenHash: digest(token), expiresAt});
    return {token, expiresAt};
};

export const claimInvitation = async (email, token) => {
    const consumedAt = new Date();
    const invitation = await Invitation.findOneAndUpdate({
        email: normalizeEmail(email),
        tokenHash: digest(token),
        consumedAt: null,
        expiresAt: {$gt: consumedAt}
    }, {$set: {consumedAt}}, {returnDocument: 'after'});
    if (!invitation) throw new ForbiddenError('Invalid or expired invitation code');
    return {id: invitation._id, consumedAt};
};

export const releaseInvitation = async (claim) => {
    await Invitation.updateOne({_id: claim.id, consumedAt: claim.consumedAt}, {$set: {consumedAt: null}});
};
