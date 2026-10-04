import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import {ENV_VARS} from '../utils/constants.js';
import {validateRuntimeConfig} from './config.js';

describe('runtime config validation', () => {
    const originalEnv = {...process.env};
    let warnSpy;

    beforeEach(() => {
        process.env[ENV_VARS.mongoUri] = 'mongodb://localhost:27017';
        process.env[ENV_VARS.dbName] = 'polypharmacy';
        process.env[ENV_VARS.openAiApiKey] = 'sk-test';
        process.env[ENV_VARS.registrationCode] = 'invite-secret';
        process.env[ENV_VARS.nodeEnv] = 'test';
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env = {...originalEnv};
        warnSpy.mockRestore();
    });

    test('requires OPENAI_API_KEY at startup', () => {
        delete process.env[ENV_VARS.openAiApiKey];

        expect(() => validateRuntimeConfig()).toThrow('Missing required environment variable: OPENAI_API_KEY');
    });

    test('does not require a shared registration code outside local runtime', () => {
        process.env[ENV_VARS.nodeEnv] = 'production';
        delete process.env[ENV_VARS.registrationCode];
        process.env[ENV_VARS.mailMode] = 'smtp';
        process.env[ENV_VARS.smtpHost] = 'localhost';
        process.env[ENV_VARS.smtpFrom] = 'noreply@example.com';
        process.env[ENV_VARS.appUrl] = 'https://app.example.com';

        expect(() => validateRuntimeConfig()).not.toThrow();
    });

    test('allows missing REGISTRATION_CODE locally', () => {
        process.env[ENV_VARS.nodeEnv] = 'development';
        delete process.env[ENV_VARS.registrationCode];

        expect(() => validateRuntimeConfig()).not.toThrow();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    test('requires configured SMTP delivery in production', () => {
        process.env[ENV_VARS.nodeEnv] = 'production';
        process.env[ENV_VARS.registrationCode] = 'a'.repeat(24);
        delete process.env[ENV_VARS.mailMode];
        expect(() => validateRuntimeConfig()).toThrow('MAIL_MODE must be smtp outside local runtime');
    });
});
