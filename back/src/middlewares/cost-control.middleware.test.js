import {describe, expect, jest, test} from '@jest/globals';
import {randomUUID} from 'crypto';
import {EXPENSIVE_ENDPOINT_RATE_LIMIT_MAX_REQUESTS} from '../utils/constants.js';
import {protectAuthEndpoint, protectExpensiveEndpoint} from './cost-control.middleware.js';

const createRequest = (overrides = {}) => ({
    ip: '127.0.0.1',
    user: {id: randomUUID()},
    method: 'POST',
    originalUrl: `/expensive-${randomUUID()}`,
    get: jest.fn(),
    ...overrides
});

describe('cost-control middleware', () => {
    test('rate limits expensive endpoints by user and route', () => {
        const req = createRequest();
        const next = jest.fn();

        for (let index = 0; index < EXPENSIVE_ENDPOINT_RATE_LIMIT_MAX_REQUESTS; index++) {
            protectExpensiveEndpoint(req, {}, next);
        }

        expect(next).toHaveBeenCalledTimes(EXPENSIVE_ENDPOINT_RATE_LIMIT_MAX_REQUESTS);
        expect(next).toHaveBeenLastCalledWith();

        protectExpensiveEndpoint(req, {}, next);

        expect(next).toHaveBeenLastCalledWith(expect.objectContaining({
            name: 'TooManyRequestsError',
            statusCode: 429,
            message: 'Rate limit exceeded for expensive endpoint'
        }));
    });

    test('rate limits sign-in attempts by client IP', () => {
        const req = createRequest();
        const next = jest.fn();
        for (let index = 0; index < 10; index++) protectAuthEndpoint(req, {}, next);
        protectAuthEndpoint(req, {}, next);
        expect(next).toHaveBeenLastCalledWith(expect.objectContaining({statusCode: 429}));
    });

    test('shares the agent rate limit between JSON and SSE routes', () => {
        const user = {id: randomUUID()};
        const next = jest.fn();
        const normal = createRequest({user, path: '/agent/ask', originalUrl: '/agent/ask'});
        const stream = createRequest({user, path: '/agent/ask/stream', originalUrl: '/agent/ask/stream'});

        for (let index = 0; index < EXPENSIVE_ENDPOINT_RATE_LIMIT_MAX_REQUESTS; index++) {
            protectExpensiveEndpoint(index % 2 ? normal : stream, {}, next);
        }
        protectExpensiveEndpoint(stream, {}, next);

        expect(next).toHaveBeenLastCalledWith(expect.objectContaining({statusCode: 429}));
    });
});
