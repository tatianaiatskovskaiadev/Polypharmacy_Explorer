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

    test('requires REGISTRATION_CODE outside local runtime', () => {
        process.env[ENV_VARS.nodeEnv] = 'production';
        delete process.env[ENV_VARS.registrationCode];

        expect(() => validateRuntimeConfig()).toThrow('Missing required environment variable outside local runtime: REGISTRATION_CODE');
    });

    test('allows missing REGISTRATION_CODE locally', () => {
        process.env[ENV_VARS.nodeEnv] = 'development';
        delete process.env[ENV_VARS.registrationCode];

        expect(() => validateRuntimeConfig()).not.toThrow();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    test('rejects a short production invitation code', () => {
        process.env[ENV_VARS.nodeEnv] = 'production';
        process.env[ENV_VARS.registrationCode] = 'short';
        expect(() => validateRuntimeConfig()).toThrow('REGISTRATION_CODE must contain at least 24 characters');
    });
});
