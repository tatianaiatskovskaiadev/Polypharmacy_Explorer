import {createHash, timingSafeEqual} from 'crypto';
import config, {isLocalRuntime} from '../../../configuration/config.js';
import {runTransaction} from '../repository/auth.repository.js';
import {createUser, sendVerificationEmail} from './auth.service.js';
import {claimInvitation, releaseInvitation} from './invitation.service.js';

const matchesRegistrationCode = (value) => {
    if (!config.registrationCode || !value) return false;
    const expected = createHash('sha256').update(config.registrationCode).digest();
    const actual = createHash('sha256').update(value).digest();
    return timingSafeEqual(expected, actual);
};

export const registerAccount = async (email, password, registrationCode) => {
    const localSharedCode = isLocalRuntime() && matchesRegistrationCode(registrationCode);
    const claim = localSharedCode ? null : await claimInvitation(email, registrationCode);
    try {
        return await runTransaction(async (session) => {
            const user = await createUser(email, password, session);
            await sendVerificationEmail(user, session);
            return user;
        });
    } catch (error) {
        if (claim) await releaseInvitation(claim);
        throw error;
    }
};
