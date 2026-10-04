import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const userCreate = jest.fn();
const userFindOne = jest.fn();
const sessionCreate = jest.fn();
const sessionDeleteOne = jest.fn();

jest.unstable_mockModule('../models/User.model.js', () => ({
    User: {create: userCreate, findOne: userFindOne}
}));
jest.unstable_mockModule('../models/Session.model.js', () => ({
    Session: {create: sessionCreate, deleteOne: sessionDeleteOne}
}));

const {authenticateUser, createSession, createUser, deleteSession, matchesCsrfToken} = await import('./auth.service.js');

describe('authentication service', () => {
    beforeEach(() => {
        userCreate.mockReset();
        userFindOne.mockReset();
        sessionCreate.mockReset();
        sessionDeleteOne.mockReset();
    });

    test('normalizes email and hashes passwords before saving', async () => {
        userCreate.mockImplementation(async (data) => ({_id: 'user-1', ...data}));
        const user = await createUser(' Person@Example.com ', 'strong-password-123');
        expect(user).toEqual({id: 'user-1', email: 'person@example.com'});
        const saved = userCreate.mock.calls[0][0];
        expect(saved.email).toBe('person@example.com');
        expect(saved.passwordHash).not.toContain('strong-password-123');
        userFindOne.mockReturnValue({select: jest.fn().mockResolvedValue({_id: 'user-1', ...saved})});
        await expect(authenticateUser('PERSON@example.com', 'strong-password-123')).resolves.toEqual(user);
        await expect(authenticateUser('person@example.com', 'wrong-password')).rejects.toMatchObject({statusCode: 401});
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
});
