import mongoose from 'mongoose';
import Joi from 'joi';
import config from '../../../configuration/config.js';
import {issueInvitation} from '../services/invitation.service.js';

const email = process.argv[2];
const {error, value} = Joi.string().trim().email().max(254).required().validate(email);
if (error || process.argv.length !== 3) {
    console.error('Usage: npm run invite -- person@example.com');
    process.exitCode = 1;
} else {
    try {
        await mongoose.connect(config.mongodb.uri, config.mongodb.db);
        const normalizedEmail = value.toLowerCase();
        const {token, expiresAt} = await issueInvitation(normalizedEmail);
        console.log(`Invitation for ${normalizedEmail} (expires ${expiresAt.toISOString()}): ${token}`);
    } catch (invitationError) {
        console.error(invitationError.message === 'An account with this email already exists'
            ? invitationError.message
            : 'Unable to create invitation; check MongoDB connection and configuration');
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}
