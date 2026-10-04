import {afterAll, afterEach, describe, expect, jest, test} from '@jest/globals';
import express from 'express';
import request from 'supertest';
import {requestLogging} from './request-logging.middleware.js';

describe('request logging middleware', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    afterAll(() => logSpy.mockRestore());
    afterEach(() => logSpy.mockClear());

    test('returns a generated request ID and logs only safe metadata', async () => {
        const app = express();
        app.use(requestLogging);
        app.get('/check', (req, res) => res.json({requestId: req.requestId}));

        const response = await request(app).get('/check?token=private-value')
            .set('X-Request-Id', 'untrusted-id')
            .set('Authorization', 'Bearer private-value');

        const requestId = response.headers['x-request-id'];
        expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
        expect(requestId).not.toBe('untrusted-id');
        expect(response.body.requestId).toBe(requestId);
        const log = JSON.parse(logSpy.mock.calls[0][0]);
        expect(log).toEqual(expect.objectContaining({
            level: 'info', event: 'request_complete', requestId, method: 'GET', status: 200,
            durationMs: expect.any(Number)
        }));
        expect(logSpy.mock.calls[0][0]).not.toContain('private-value');
        expect(logSpy.mock.calls[0][0]).not.toContain('/check');
    });
});
