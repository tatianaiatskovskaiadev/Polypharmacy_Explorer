import {describe, expect, jest, test} from '@jest/globals';
import errorHandler from './error.middleware.js';
import {ExternalServiceError} from '../utils/errors.js';

const createResponse = () => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    };
    return res;
};

describe('error middleware', () => {
    test('returns normalized response for ApiError instances', () => {
        const req = {path: '/interactions/check'};
        const res = createResponse();

        errorHandler(new ExternalServiceError('FDA unavailable'), req, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            status: 502,
            error: 'ExternalServiceError',
            message: 'FDA unavailable',
            path: '/interactions/check'
        }));
    });

    test('hides unexpected internal error details', () => {
        const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const req = {path: '/search', requestId: 'request-123'};
        const res = createResponse();

        errorHandler(new Error('database password leaked here'), req, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            status: 500,
            error: 'Internal Server Error',
            message: 'An unexpected error occurred. Please try again later.',
            path: '/search',
            requestId: 'request-123'
        }));
        expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual(expect.objectContaining({
            event: 'request_error', requestId: 'request-123', errorType: 'Error'
        }));
        expect(logSpy.mock.calls[0][0]).not.toContain('database password');
        logSpy.mockRestore();
    });

    test('does not expose duplicate record values', () => {
        const req = {path: '/search'};
        const res = createResponse();

        errorHandler({code: 11000, keyValue: {name: 'private-value'}}, req, res, jest.fn());

        expect(res.json.mock.calls[0][0].message).toBe('A record with this value already exists');
    });
});
