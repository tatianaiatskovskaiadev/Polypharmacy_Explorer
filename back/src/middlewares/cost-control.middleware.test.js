import {afterEach, describe, expect, jest, test} from '@jest/globals';
import {randomUUID} from 'crypto';
import config from '../configuration/config.js';
import {EXPENSIVE_ENDPOINT_RATE_LIMIT_MAX_REQUESTS} from '../utils/constants.js';
import {protectExpensiveEndpoint} from './cost-control.middleware.js';

const createRequest = (overrides = {}) => ({
    ip: '127.0.0.1',
    method: 'POST',
    originalUrl: `/expensive-${randomUUID()}`,
    get: jest.fn(),
    ...overrides
});

describe('cost-control middleware', () => {
    const originalDemoApiKey = config.demoApiKey;

    afterEach(() => {
        config.demoApiKey = originalDemoApiKey;
    });

    test('rejects expensive endpoints when demo API key is configured and missing', () => {
        config.demoApiKey = 'demo-secret';
        const req = createRequest();
        const next = jest.fn();

        protectExpensiveEndpoint(req, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            name: 'UnauthorizedError',
            statusCode: 401,
            message: 'Missing or invalid demo API key'
        }));
    });

    test('allows expensive endpoints when configured demo API key matches', () => {
        config.demoApiKey = 'demo-secret';
        const req = createRequest({
            get: jest.fn().mockReturnValue('demo-secret')
        });
        const next = jest.fn();

        protectExpensiveEndpoint(req, {}, next);

        expect(next).toHaveBeenCalledWith();
    });

    test('rate limits expensive endpoints by client and route', () => {
        config.demoApiKey = undefined;
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
});
