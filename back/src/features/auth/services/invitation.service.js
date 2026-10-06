import {createHash, randomBytes} from 'crypto';
import * as invitationRepository from '../repository/invitation.repository.js';
import {userExists} from '../repository/auth.repository.js';
import {ForbiddenError} from '../../../utils/errors.js';

export const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeEmail = (email) => email.trim().toLowerCase();
const digest = (value) => createHash('sha256').update(value).digest('hex');

export const issueInvitation = async (email) => {
    const normalizedEmail = normalizeEmail(email);
    if (await userExists(normalizedEmail)) throw new Error('An account with this email already exists');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_DURATION_MS);
    await invitationRepository.createInvitation({email: normalizedEmail, tokenHash: digest(token), expiresAt});
    return {token, expiresAt};
};

export const claimInvitation = async (email, token) => {
    const consumedAt = new Date();
    const invitation = await invitationRepository.consumeInvitation(normalizeEmail(email), digest(token), consumedAt);
    if (!invitation) throw new ForbiddenError('Invalid or expired invitation code');
    return {id: invitation._id, consumedAt};
};

export const releaseInvitation = async (claim) => {
    await invitationRepository.releaseInvitation(claim.id, claim.consumedAt);
};
