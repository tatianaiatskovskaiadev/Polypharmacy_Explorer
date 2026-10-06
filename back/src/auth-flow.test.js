import {afterEach, describe, expect, jest, test} from '@jest/globals';
import request from 'supertest';
import config from './configuration/config.js';
import {ConflictError, ForbiddenError} from './utils/errors.js';

const user = {id: '507f1f77bcf86cd799439011', email: 'person@example.com', emailVerified: true, role: 'user'};
const csrfToken = 'a'.repeat(64);
let sessionActive = false;
let emailVerifiedAt;
let sessionRole = 'user';
const registerAccount = jest.fn().mockResolvedValue(user);
jest.unstable_mockModule('./features/auth/services/registration.service.js', () => ({registerAccount}));

jest.unstable_mockModule('./features/auth/services/auth.service.js', () => ({
    SESSION_COOKIE_NAME: 'pe_session',
    SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
    authenticateUser: jest.fn().mockResolvedValue(user),
    createSession: jest.fn().mockImplementation(async () => {
        sessionActive = true;
        return {token: 'b'.repeat(64), csrfToken};
    }),
    getSession: jest.fn().mockImplementation(async (token) => (
        sessionActive && token === 'b'.repeat(64)
            ? {userId: {_id: user.id, email: user.email, emailVerifiedAt, role: sessionRole}, csrfToken}
            : null
    )),
    deleteSession: jest.fn().mockImplementation(async () => { sessionActive = false; }),
    resendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    verifyEmail: jest.fn().mockResolvedValue(undefined),
    requestPasswordReset: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockImplementation(async () => { sessionActive = false; }),
    listUserSessions: jest.fn().mockImplementation(async () => sessionActive ? [{
        id: '507f1f77bcf86cd799439012',
        createdAt: new Date('2026-01-01'),
        expiresAt: new Date('2026-01-08'),
        current: true
    }] : []),
    revokeUserSession: jest.fn().mockImplementation(async () => { sessionActive = false; return true; }),
    matchesCsrfToken: jest.fn().mockImplementation((_session, token) => token === csrfToken)
}));

const {default: app} = await import('./app.js');

describe('API authentication flow', () => {
    const previousCode = config.registrationCode;
    afterEach(() => {
        config.registrationCode = previousCode;
        sessionActive = false;
        emailVerifiedAt = undefined;
        sessionRole = 'user';
        registerAccount.mockReset().mockResolvedValue(user);
    });

    test('passes registration data to the service', async () => {
        const previousEnvironment = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        config.registrationCode = 'shared-code';
        try {
            const registration = await request(app).post('/auth/register').send({
                email: user.email, password: 'a-long-unique-password', registrationCode: 'shared-code'
            });
            expect(registration.status).toBe(200);
            expect(registerAccount).toHaveBeenCalledWith(user.email, 'a-long-unique-password', 'shared-code');
        } finally {
            if (previousEnvironment === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previousEnvironment;
        }
    });

    test('rejects an invalid invitation before creating an account', async () => {
        registerAccount.mockRejectedValueOnce(new ForbiddenError('Invalid invitation'));
        const registration = await request(app).post('/auth/register').send({
            email: user.email, password: 'a-long-unique-password', registrationCode: 'invalid-code'
        });
        expect(registration.status).toBe(403);
        expect(registerAccount).toHaveBeenCalledTimes(1);
    });

    test('returns a service conflict without opening a session', async () => {
        registerAccount.mockRejectedValueOnce(new ConflictError('Existing account'));
        const registration = await request(app).post('/auth/register').send({
            email: user.email, password: 'a-long-unique-password', registrationCode: 'valid-code'
        });
        expect(registration.status).toBe(409);
        expect(sessionActive).toBe(false);
    });

    test('returns a service failure without opening a session', async () => {
        registerAccount.mockRejectedValueOnce(new Error('outbox unavailable'));
        const registration = await request(app).post('/auth/register').send({
            email: user.email, password: 'a-long-unique-password', registrationCode: 'valid-code'
        });
        expect(registration.status).toBe(500);
        expect(sessionActive).toBe(false);
    });

    test('registers, protects writes with CSRF, and invalidates the session on logout', async () => {
        config.registrationCode = 'test-invitation-code';
        const registration = await request(app).post('/auth/register').send({
            email: user.email,
            password: 'a-long-unique-password',
            registrationCode: config.registrationCode
        });
        expect(registration.status).toBe(200);
        expect(registration.body).toEqual({user, csrfToken});
        expect(registerAccount).toHaveBeenCalledWith(user.email, 'a-long-unique-password', config.registrationCode);
        expect(registration.headers['set-cookie'][0]).toContain('HttpOnly');
        expect(registration.headers['set-cookie'][0]).toContain('SameSite=Lax');
        const cookie = registration.headers['set-cookie'][0].split(';')[0];

        const current = await request(app).get('/auth/me').set('Cookie', cookie);
        expect(current.body).toEqual({user, csrfToken});
        expect(current.headers['cache-control']).toBe('no-store');

        const sessions = await request(app).get('/auth/sessions').set('Cookie', cookie);
        expect(sessions.status).toBe(200);
        expect(sessions.body.sessions).toEqual([expect.objectContaining({current: true})]);

        const missingRevokeCsrf = await request(app).delete('/auth/sessions/507f1f77bcf86cd799439012').set('Cookie', cookie);
        expect(missingRevokeCsrf.status).toBe(403);

        const missingCsrf = await request(app).post('/search').set('Cookie', cookie).send({text: ''});
        expect(missingCsrf.status).toBe(403);

        const invalidSearch = await request(app).post('/search').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken).send({text: ''});
        expect(invalidSearch.status).toBe(400);

        const invalidRag = await request(app).post('/rag/answer').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken).send({question: 'Hi', drugIds: ['invalid']});
        expect(invalidRag.status).toBe(400);

        const tooManyAgentDrugs = await request(app).post('/agent/ask').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken).send({
                question: 'What interactions are described?',
                drugIds: Array.from({length: 5}, (_, index) => index.toString(16).padStart(24, '0'))
            });
        expect(tooManyAgentDrugs.status).toBe(400);

        const streamWithoutCsrf = await request(app).post('/agent/ask/stream').set('Cookie', cookie)
            .send({question: 'What interactions are described?', drugIds: ['507f1f77bcf86cd799439011']});
        expect(streamWithoutCsrf.status).toBe(403);

        const invalidStream = await request(app).post('/agent/ask/stream').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken).send({question: 'Hi', drugIds: ['invalid']});
        expect(invalidStream.status).toBe(400);

        const logout = await request(app).post('/auth/logout').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken);
        expect(logout.status).toBe(204);
        expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(401);
    });

    test('keeps new unverified accounts out of costly routes until confirmation', async () => {
        config.registrationCode = 'test-invitation-code';
        emailVerifiedAt = null;
        const registration = await request(app).post('/auth/register').send({
            email: user.email, password: 'a-long-unique-password', registrationCode: config.registrationCode
        });
        const cookie = registration.headers['set-cookie'][0].split(';')[0];
        expect((await request(app).post('/search').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken).send({text: ''})).status).toBe(403);
        expect((await request(app).post('/auth/resend-verification').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken)).status).toBe(202);
        expect((await request(app).post('/auth/verify').send({token: 'c'.repeat(64)})).status).toBe(204);
        emailVerifiedAt = new Date();
        expect((await request(app).post('/search').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken).send({text: ''})).status).toBe(400);
    });

    test('allows only administrators to reach drug creation validation', async () => {
        sessionActive = true;
        emailVerifiedAt = new Date();
        const cookie = `pe_session=${'b'.repeat(64)}`;
        const ordinaryResponse = await request(app).post('/').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken).send({});
        expect(ordinaryResponse.status).toBe(403);

        sessionRole = 'admin';
        const adminResponse = await request(app).post('/').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken).send({});
        expect(adminResponse.status).toBe(400);
    });

    test('accepts a generic reset request and expires the browser session after reset', async () => {
        const login = await request(app).post('/auth/login').send({email: user.email, password: 'a-long-unique-password'});
        const cookie = login.headers['set-cookie'][0].split(';')[0];
        const forgot = await request(app).post('/auth/forgot-password').send({email: user.email});
        expect(forgot.status).toBe(202);
        const reset = await request(app).post('/auth/reset-password').send({
            token: 'c'.repeat(64), password: 'another-strong-password'
        });
        expect(reset.status).toBe(204);
        expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(401);
    });
});
