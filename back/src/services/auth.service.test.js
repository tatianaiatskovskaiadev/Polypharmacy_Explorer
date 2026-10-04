import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const userCreate = jest.fn();
const userFindOne = jest.fn();
const sessionCreate = jest.fn();
const sessionDeleteOne = jest.fn();
const sessionFind = jest.fn();
const sessionFindOneAndDelete = jest.fn();
const sessionDeleteMany = jest.fn();
const authTokenDeleteMany = jest.fn();
const authTokenFindOneAndDelete = jest.fn();
const mailJobUpdateMany = jest.fn();
const userFindById = jest.fn();
const userUpdateOne = jest.fn();
const queueActionEmail = jest.fn();

jest.unstable_mockModule('../models/User.model.js', () => ({
    User: {create: userCreate, findOne: userFindOne, findById: userFindById, updateOne: userUpdateOne}
}));
jest.unstable_mockModule('../models/Session.model.js', () => ({
    Session: {create: sessionCreate, deleteOne: sessionDeleteOne, deleteMany: sessionDeleteMany, find: sessionFind, findOneAndDelete: sessionFindOneAndDelete}
}));
jest.unstable_mockModule('../models/AuthToken.model.js', () => ({
    AuthToken: {deleteMany: authTokenDeleteMany, findOneAndDelete: authTokenFindOneAndDelete}
}));
jest.unstable_mockModule('../models/MailJob.model.js', () => ({MailJob: {updateMany: mailJobUpdateMany}}));
jest.unstable_mockModule('./mail-queue.service.js', () => ({queueActionEmail}));

const {
    authenticateUser, createSession, createUser, deleteSession, listUserSessions, matchesCsrfToken,
    requestPasswordReset, resetPassword, revokeUserSession, sendVerificationEmail, verifyEmail
} = await import('./auth.service.js');

describe('authentication service', () => {
    beforeEach(() => {
        userCreate.mockReset();
        userFindOne.mockReset();
        sessionCreate.mockReset();
        sessionDeleteOne.mockReset();
        sessionFind.mockReset();
        sessionFindOneAndDelete.mockReset();
        sessionDeleteMany.mockReset();
        authTokenDeleteMany.mockReset();
        authTokenFindOneAndDelete.mockReset();
        mailJobUpdateMany.mockReset();
        userFindById.mockReset();
        userUpdateOne.mockReset();
        queueActionEmail.mockReset();
    });

    test('normalizes email and hashes passwords before saving', async () => {
        userCreate.mockImplementation(async (data) => ({_id: 'user-1', ...data}));
        const user = await createUser(' Person@Example.com ', 'strong-password-123');
        expect(user).toEqual({id: 'user-1', email: 'person@example.com', emailVerified: false, role: 'user'});
        const saved = userCreate.mock.calls[0][0];
        expect(saved.email).toBe('person@example.com');
        expect(saved.role).toBe('user');
        expect(saved.passwordHash).not.toContain('strong-password-123');
        userFindOne.mockReturnValue({select: jest.fn().mockResolvedValue({_id: 'user-1', ...saved})});
        await expect(authenticateUser('PERSON@example.com', 'strong-password-123')).resolves.toEqual(user);
        await expect(authenticateUser('person@example.com', 'wrong-password')).rejects.toMatchObject({statusCode: 401});
    });

    test('returns the stored administrator role after login', async () => {
        userCreate.mockImplementation(async (data) => ({_id: 'user-1', ...data}));
        await createUser('admin@example.com', 'strong-password-123');
        const saved = userCreate.mock.calls[0][0];
        userFindOne.mockReturnValue({select: jest.fn().mockResolvedValue({
            _id: 'user-1', ...saved, role: 'admin'
        })});

        await expect(authenticateUser('admin@example.com', 'strong-password-123'))
            .resolves.toMatchObject({role: 'admin'});
    });

    test('stores a hashed session token and invalidates it on logout', async () => {
        sessionCreate.mockResolvedValue({});
        const {token, csrfToken} = await createSession('user-1');
        const saved = sessionCreate.mock.calls[0][0];
        expect(saved.tokenHash).not.toBe(token);
        expect(saved.tokenHash).toHaveLength(64);
        expect(matchesCsrfToken(saved, csrfToken)).toBe(true);
        expect(matchesCsrfToken(saved, '0'.repeat(64))).toBe(false);
        await deleteSession(token);
        expect(sessionDeleteOne).toHaveBeenCalledWith({tokenHash: saved.tokenHash});
    });

    test('lists only owned active sessions and revokes by user and session ID', async () => {
        const {token: createdToken} = await createSession('user-1');
        const currentHash = sessionCreate.mock.calls[0][0].tokenHash;
        const sessions = [{
            _id: 'session-1', tokenHash: currentHash,
            createdAt: new Date('2026-01-01'), expiresAt: new Date('2026-01-08')
        }];
        const lean = jest.fn().mockResolvedValue(sessions);
        sessionFind.mockReturnValue({select: () => ({sort: () => ({lean})})});
        const result = await listUserSessions('user-1', createdToken);
        expect(result).toEqual([expect.objectContaining({id: 'session-1', current: true})]);
        expect(sessionFind).toHaveBeenCalledWith({userId: 'user-1', expiresAt: {$gt: expect.any(Date)}});
        sessionFindOneAndDelete.mockResolvedValue(sessions[0]);
        await expect(revokeUserSession('user-1', 'session-1', createdToken)).resolves.toBe(true);
        expect(sessionFindOneAndDelete).toHaveBeenCalledWith({_id: 'session-1', userId: 'user-1'});
    });

    test('queues verification and consumes its token once', async () => {
        const user = {id: 'user-1', email: 'person@example.com', emailVerified: false};
        await sendVerificationEmail(user);
        expect(queueActionEmail).toHaveBeenCalledWith(user.id, 'verify-email', undefined);

        authTokenFindOneAndDelete.mockResolvedValueOnce({userId: user.id}).mockResolvedValueOnce(null);
        await verifyEmail('a'.repeat(64));
        expect(userUpdateOne).toHaveBeenCalledWith({_id: user.id}, {$set: {emailVerifiedAt: expect.any(Date)}});
        expect(authTokenDeleteMany).toHaveBeenCalledWith({userId: user.id, purpose: 'verify-email'});
        await expect(verifyEmail('a'.repeat(64))).rejects.toMatchObject({statusCode: 400});
    });

    test('resets a password and revokes all user sessions', async () => {
        userFindOne.mockResolvedValue({_id: 'user-1', email: 'person@example.com'});
        await requestPasswordReset('PERSON@example.com');
        expect(userFindOne).toHaveBeenCalledWith({email: 'person@example.com'});
        expect(queueActionEmail).toHaveBeenCalledWith('user-1', 'reset-password');
        authTokenFindOneAndDelete.mockResolvedValue({userId: 'user-1'});
        await resetPassword('a'.repeat(64), 'another-strong-password');
        expect(userUpdateOne).toHaveBeenCalledWith({_id: 'user-1'}, {$set: {passwordHash: expect.any(String)}});
        expect(sessionDeleteMany).toHaveBeenCalledWith({userId: 'user-1'});
        expect(mailJobUpdateMany).toHaveBeenCalledWith(
            {userId: 'user-1', purpose: 'reset-password', state: 'pending'}, {$set: {state: 'failed'}}
        );
    });
});
