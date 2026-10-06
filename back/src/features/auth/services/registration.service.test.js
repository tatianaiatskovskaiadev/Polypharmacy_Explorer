import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import config from '../../../configuration/config.js';

const runTransaction = jest.fn();
const createUser = jest.fn();
const sendVerificationEmail = jest.fn();
const claimInvitation = jest.fn();
const releaseInvitation = jest.fn();

jest.unstable_mockModule('../repository/auth.repository.js', () => ({runTransaction}));
jest.unstable_mockModule('./auth.service.js', () => ({createUser, sendVerificationEmail}));
jest.unstable_mockModule('./invitation.service.js', () => ({claimInvitation, releaseInvitation}));

const {registerAccount} = await import('./registration.service.js');

describe('registration service', () => {
    const previousCode = config.registrationCode;

    beforeEach(() => {
        config.registrationCode = previousCode;
        runTransaction.mockReset().mockImplementation((callback) => callback({id: 'transaction'}));
        createUser.mockReset().mockResolvedValue({id: 'user-1', emailVerified: false});
        sendVerificationEmail.mockReset();
        claimInvitation.mockReset().mockResolvedValue({id: 'invitation-1'});
        releaseInvitation.mockReset();
    });

    test('creates a user and verification job in one transaction', async () => {
        config.registrationCode = undefined;
        await expect(registerAccount('person@example.com', 'password', 'code')).resolves.toMatchObject({id: 'user-1'});
        expect(claimInvitation).toHaveBeenCalledWith('person@example.com', 'code');
        expect(createUser).toHaveBeenCalledWith('person@example.com', 'password', {id: 'transaction'});
        expect(sendVerificationEmail).toHaveBeenCalledWith({id: 'user-1', emailVerified: false}, {id: 'transaction'});
    });

    test('releases an invitation when the transaction fails', async () => {
        config.registrationCode = undefined;
        sendVerificationEmail.mockRejectedValueOnce(new Error('outbox unavailable'));
        await expect(registerAccount('person@example.com', 'password', 'code')).rejects.toThrow('outbox unavailable');
        expect(releaseInvitation).toHaveBeenCalledWith({id: 'invitation-1'});
    });

    test('allows a local shared code without claiming an invitation', async () => {
        config.registrationCode = 'shared-code';
        await registerAccount('person@example.com', 'password', 'shared-code');
        expect(claimInvitation).not.toHaveBeenCalled();
    });

    test('requires an invitation outside local runtime even if the shared code matches', async () => {
        const previousEnvironment = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        config.registrationCode = 'shared-code';
        try {
            await registerAccount('person@example.com', 'password', 'shared-code');
            expect(claimInvitation).toHaveBeenCalledWith('person@example.com', 'shared-code');
        } finally {
            if (previousEnvironment === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previousEnvironment;
        }
    });
});
