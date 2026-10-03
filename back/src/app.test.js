import {describe, expect, test} from '@jest/globals';
import request from 'supertest';
import app from './app.js';
import {DEMO_API_KEY_HEADER} from './utils/constants.js';

describe('app', () => {
    test('rejects invalid search payload with normalized validation error', async () => {
        const response = await request(app)
            .post('/search')
            .set(DEMO_API_KEY_HEADER, process.env.DEMO_API_KEY ?? '')
            .send({text: ''});

        expect(response.status).toBe(400);
        expect(response.body).toEqual(expect.objectContaining({
            status: 400,
            error: 'Bad Request',
            path: '/search'
        }));
        expect(response.body.message).toContain('"text" is not allowed to be empty');
    });

    test('can be imported without starting the HTTP server', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            status: 'degraded',
            db: 'down'
        });
    });

    test('validates RAG questions before retrieval', async () => {
        const response = await request(app)
            .post('/rag/answer')
            .set(DEMO_API_KEY_HEADER, process.env.DEMO_API_KEY ?? '')
            .send({question: 'Hi', drugIds: ['invalid']});

        expect(response.status).toBe(400);
        expect(response.body.path).toBe('/rag/answer');
    });

    test('limits agent requests to four selected drugs', async () => {
        const response = await request(app)
            .post('/agent/ask')
            .set(DEMO_API_KEY_HEADER, process.env.DEMO_API_KEY ?? '')
            .send({question: 'What interactions are described?', drugIds: Array.from({length: 5}, (_, index) => (
                index.toString(16).padStart(24, '0')
            ))});

        expect(response.status).toBe(400);
        expect(response.body.path).toBe('/agent/ask');
    });

    test('does not apply expensive endpoint protection to unknown routes', async () => {
        const response = await request(app)
            .post('/unknown')
            .send({});

        expect(response.status).toBe(404);
        expect(response.text).toBe('Not Found');
    });
});
