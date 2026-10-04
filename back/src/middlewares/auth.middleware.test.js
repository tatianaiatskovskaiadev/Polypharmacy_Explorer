import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const getSession = jest.fn();
const matchesCsrfToken = jest.fn();

jest.unstable_mockModule('../services/auth.service.js', () => ({
    getSession,
    matchesCsrfToken,
    SESSION_COOKIE_NAME: 'pe_session'
}));

const {getSessionToken, requireAllowedOrigin, requireAuth, requireCsrf} = await import('./auth.middleware.js');

describe('authentication middleware', () => {
    beforeEach(() => {
        getSession.mockReset();
        matchesCsrfToken.mockReset();
    });

    test('reads the session cookie without accepting a similarly named cookie', () => {
        expect(getSessionToken({headers: {cookie: 'other=abc; pe_session=real-token; pe_session_copy=fake'}}))
            .toBe('real-token');
    });

    test('rejects a missing or expired session', async () => {
        getSession.mockResolvedValue(null);
        const next = jest.fn();
        await requireAuth({headers: {}}, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode: 401}));
    });

    test('sets user identity from a valid session and checks CSRF', async () => {
        const session = {userId: {_id: 'user-1', email: 'person@example.com'}, csrfToken: 'csrf'};
        getSession.mockResolvedValue(session);
        matchesCsrfToken.mockReturnValue(true);
        const req = {headers: {cookie: 'pe_session=token'}, get: jest.fn().mockReturnValue('csrf')};
        const res = {set: jest.fn()};
        const next = jest.fn();
        await requireAuth(req, res, next);
        requireCsrf(req, {}, next);
        expect(req.user).toEqual({id: 'user-1', email: 'person@example.com'});
        expect(matchesCsrfToken).toHaveBeenCalledWith(session, 'csrf');
        expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(next).toHaveBeenLastCalledWith();
    });

    test('rejects missing CSRF token', () => {
        matchesCsrfToken.mockReturnValue(false);
        const next = jest.fn();
        requireCsrf({authSession: {}, get: () => undefined}, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode: 403}));
    });

    test('rejects an untrusted request origin', () => {
        const next = jest.fn();
        requireAllowedOrigin({get: () => 'https://untrusted.example'}, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode: 403}));
    });
});
