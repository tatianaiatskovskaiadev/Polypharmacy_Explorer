import {afterEach, describe, expect, jest, test} from '@jest/globals';
import request from 'supertest';
import config from './configuration/config.js';

const user = {id: '507f1f77bcf86cd799439011', email: 'person@example.com'};
const csrfToken = 'a'.repeat(64);
let sessionActive = false;

jest.unstable_mockModule('./services/auth.service.js', () => ({
    SESSION_COOKIE_NAME: 'pe_session',
    SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
    createUser: jest.fn().mockResolvedValue(user),
    authenticateUser: jest.fn().mockResolvedValue(user),
    createSession: jest.fn().mockImplementation(async () => {
        sessionActive = true;
        return {token: 'b'.repeat(64), csrfToken};
    }),
    getSession: jest.fn().mockImplementation(async (token) => (
        sessionActive && token === 'b'.repeat(64)
            ? {userId: {_id: user.id, email: user.email}, csrfToken}
            : null
    )),
    deleteSession: jest.fn().mockImplementation(async () => { sessionActive = false; }),
    matchesCsrfToken: jest.fn().mockImplementation((_session, token) => token === csrfToken)
}));

const {default: app} = await import('./app.js');

describe('API authentication flow', () => {
    const previousCode = config.registrationCode;

    afterEach(() => {
        config.registrationCode = previousCode;
        sessionActive = false;
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
        expect(registration.headers['set-cookie'][0]).toContain('HttpOnly');
        expect(registration.headers['set-cookie'][0]).toContain('SameSite=Lax');
        const cookie = registration.headers['set-cookie'][0].split(';')[0];

        const current = await request(app).get('/auth/me').set('Cookie', cookie);
        expect(current.body).toEqual({user, csrfToken});
        expect(current.headers['cache-control']).toBe('no-store');

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

        const logout = await request(app).post('/auth/logout').set('Cookie', cookie)
            .set('x-csrf-token', csrfToken);
        expect(logout.status).toBe(204);
        expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(401);
    });
});
