import {afterAll, afterEach, describe, expect, jest, test} from '@jest/globals';
import express from 'express';
import request from 'supertest';
import {requestLogging} from './request-logging.middleware.js';
import {recordModelUsage, recordPromptVersion, recordResult, recordRetrieval} from '../eval/metrics.js';

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

    test('logs AI metrics with the same request ID without logging prompt text', async () => {
        const app = express();
        app.use(requestLogging);
        app.post('/rag/answer', (req, res) => {
            recordPromptVersion('rag-answer-v1');
            recordModelUsage({usage: {prompt_tokens: 10, completion_tokens: 2}}, 'gpt-4o-mini');
            recordRetrieval([{score: 0.9}]);
            recordResult({sources: [{number: 1}]}, true);
            res.json({answer: 'private answer'});
        });

        const response = await request(app).post('/rag/answer').send({question: 'private question'});
        const entries = logSpy.mock.calls.map(([line]) => JSON.parse(line));
        const trace = entries.find(({event}) => event === 'ai_request_complete');

        expect(trace).toEqual(expect.objectContaining({
            traceId: response.headers['x-request-id'],
            promptVersion: 'rag-answer-v1',
            inputTokens: 10,
            outputTokens: 2,
            result: {citationCount: 1, insufficientEvidence: false, validationPassed: true}
        }));
        expect(JSON.stringify(entries)).not.toMatch(/private question|private answer/);
    });
});
