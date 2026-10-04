import {expect, jest, test} from '@jest/globals';
import validate from './validation.middleware.js';

test('rejects a role supplied during registration', () => {
    const response = {status: jest.fn().mockReturnThis(), json: jest.fn()};
    const next = jest.fn();
    validate('register')({
        body: {
            email: 'person@example.com',
            password: 'a-long-unique-password',
            registrationCode: 'valid-code',
            role: 'admin'
        },
        path: '/auth/register'
    }, response, next);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
});
