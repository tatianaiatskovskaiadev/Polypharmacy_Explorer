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
        const req = {path: '/search'};
        const res = createResponse();

        errorHandler(new Error('database password leaked here'), req, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            status: 500,
            error: 'Internal Server Error',
            message: 'An unexpected error occurred. Please try again later.',
            path: '/search'
        }));
    });
});
