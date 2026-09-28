import {describe, expect, test} from '@jest/globals';
import request from 'supertest';
import app from './app.js';

describe('app', () => {
    test('rejects invalid search payload with normalized validation error', async () => {
        const response = await request(app)
            .post('/search')
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
});
