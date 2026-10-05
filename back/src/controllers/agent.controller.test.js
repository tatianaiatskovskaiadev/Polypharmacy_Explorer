import {afterAll, beforeEach, describe, expect, jest, test} from '@jest/globals';
import express from 'express';
import http from 'node:http';
import request from 'supertest';
import {ExternalServiceError} from '../utils/errors.js';

const executeAgent = jest.fn();
jest.unstable_mockModule('../services/agent.service.js', () => ({askAgent: jest.fn(), executeAgent}));

const {default: agentRoutes} = await import('../routes/agent.routes.js');
const {requestLogging} = await import('../middlewares/request-logging.middleware.js');
const app = express();
app.use(requestLogging);
app.use(express.json());
app.use('/', agentRoutes);

const body = {question: 'What do the selected labels say?', drugIds: ['507f1f77bcf86cd799439011']};
const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
});

describe('agent SSE controller', () => {
    beforeEach(() => executeAgent.mockReset());

    test('emits named events and a final result with the request trace ID', async () => {
        const result = {answer: 'Grounded [1].', sources: [{number: 1}], toolCalls: [], promptVersion: 'agent-tools-v1'};
        executeAgent.mockImplementation(async (_question, _drugIds, {onEvent}) => {
            onEvent('agent.started', {});
            onEvent('answer.delta', {text: result.answer});
            onEvent('sources', {sources: result.sources});
            onEvent('agent.completed', {promptVersion: result.promptVersion, result});
            return result;
        });

        const response = await request(app).post('/agent/ask/stream').send(body);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/event-stream');
        expect(response.text).toContain('event: agent.started\n');
        expect(response.text).toContain('event: answer.delta\n');
        expect(response.text).toContain(`data: ${JSON.stringify({text: result.answer})}\n`);
        expect(response.text).toContain('event: agent.completed\n');
        expect(executeAgent).toHaveBeenCalledWith(body.question, body.drugIds, expect.objectContaining({
            signal: expect.any(AbortSignal), onEvent: expect.any(Function)
        }));
        const entries = logSpy.mock.calls.map(([line]) => JSON.parse(line));
        expect(entries.find(({event}) => event === 'ai_request_complete')).toEqual(expect.objectContaining({
            traceId: response.headers['x-request-id'],
            timeToFirstEventMs: expect.any(Number),
            timeToFirstTokenMs: expect.any(Number)
        }));
    });

    test('sends a safe error event after SSE headers are sent', async () => {
        executeAgent.mockRejectedValueOnce(new ExternalServiceError('provider secret details'));
        const response = await request(app).post('/agent/ask/stream').send(body);

        expect(response.status).toBe(200);
        expect(response.text).toContain('event: error\n');
        expect(response.text).toContain('EXTERNAL_SERVICE_ERROR');
        expect(response.text).toContain(response.headers['x-request-id']);
        expect(response.text).not.toContain('provider secret details');
    });

    test('aborts work when the client disconnects', async () => {
        let notifyAbort;
        const aborted = new Promise((resolve) => { notifyAbort = resolve; });
        executeAgent.mockImplementation((_question, _drugIds, {signal, onEvent}) => {
            onEvent('agent.started', {});
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => {
                    notifyAbort();
                    reject(signal.reason);
                }, {once: true});
            });
        });
        const server = app.listen(0);
        try {
            await new Promise((resolve, reject) => {
                const streamRequest = http.request({
                    hostname: '127.0.0.1',
                    port: server.address().port,
                    path: '/agent/ask/stream',
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'}
                }, (response) => {
                    expect(response.statusCode).toBe(200);
                    response.once('data', () => {
                        streamRequest.destroy();
                        resolve();
                    });
                });
                streamRequest.on('error', reject);
                streamRequest.end(JSON.stringify(body));
            });
            await aborted;
            expect(executeAgent.mock.calls[0][2].signal.aborted).toBe(true);
        } finally {
            server.close();
        }
    });
});
