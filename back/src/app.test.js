import {describe, expect, test} from '@jest/globals';
import request from 'supertest';
import app from './app.js';

describe('app', () => {
    test('requires a session before validating protected search requests', async () => {
        const response = await request(app)
            .post('/search')
            .send({text: ''});

        expect(response.status).toBe(401);
        expect(response.body).toEqual(expect.objectContaining({
            status: 401,
            error: 'UnauthorizedError',
            path: '/search'
        }));
    });

    test('can be imported without starting the HTTP server', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            status: 'degraded',
            db: 'down'
        });
    });

    test('requires a session for RAG requests', async () => {
        const response = await request(app)
            .post('/rag/answer')
            .send({question: 'Hi', drugIds: ['invalid']});

        expect(response.status).toBe(401);
        expect(response.body.path).toBe('/rag/answer');
    });

    test('requires a session for agent requests', async () => {
        const response = await request(app)
            .post('/agent/ask')
            .send({question: 'What interactions are described?', drugIds: Array.from({length: 5}, (_, index) => (
                index.toString(16).padStart(24, '0')
            ))});

        expect(response.status).toBe(401);
        expect(response.body.path).toBe('/agent/ask');
    });

    test('rejects malformed registration before reaching the database', async () => {
        const response = await request(app).post('/auth/register').send({email: 'invalid', password: 'short'});
        expect(response.status).toBe(400);
        expect(response.body.path).toBe('/auth/register');
    });

    test('blocks a disallowed origin on write requests', async () => {
        const response = await request(app).post('/auth/login')
            .set('Origin', 'https://untrusted.example')
            .send({email: 'person@example.com', password: 'password'});
        expect(response.status).toBe(403);
    });

    test('does not apply expensive endpoint protection to unknown routes', async () => {
        const response = await request(app)
            .post('/unknown')
            .send({});

        expect(response.status).toBe(404);
        expect(response.text).toBe('Not Found');
    });
});
