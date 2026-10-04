import {afterEach, describe, expect, jest, test} from '@jest/globals';
import config from '../configuration/config.js';

const sendMail = jest.fn().mockResolvedValue({});
const createTransport = jest.fn().mockReturnValue({sendMail});

jest.unstable_mockModule('nodemailer', () => ({default: {createTransport}}));

const {sendActionEmail} = await import('./mail.service.js');

describe('account email delivery', () => {
    const previousConfig = {...config.mail};
    const previousAppUrl = config.appUrl;

    afterEach(() => {
        config.mail = {...previousConfig};
        config.appUrl = previousAppUrl;
        sendMail.mockClear();
        createTransport.mockClear();
    });

    test('sends a reset link to the SPA root over configured SMTP', async () => {
        config.appUrl = 'https://app.example.com';
        config.mail = {mode: 'smtp', host: 'smtp.example.com', port: 587, user: 'sender', password: 'secret', from: 'sender@example.com'};
        await sendActionEmail('person@example.com', 'reset-password', 'a'.repeat(64));
        expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
            host: 'smtp.example.com', port: 587, secure: false, requireTLS: true
        }));
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
            from: 'sender@example.com',
            to: 'person@example.com',
            text: expect.stringContaining(`https://app.example.com/?reset=${'a'.repeat(64)}`)
        }));
    });

    test('does not expose SMTP failure details to API clients', async () => {
        config.mail = {mode: 'smtp', host: 'smtp.example.com', port: 587, from: 'sender@example.com'};
        sendMail.mockRejectedValueOnce(new Error('SMTP credentials secret'));
        await expect(sendActionEmail('person@example.com', 'verify-email', 'a'.repeat(64)))
            .rejects.toMatchObject({statusCode: 502, message: 'Email delivery unavailable'});
    });
});
