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
        process.env[ENV_VARS.demoApiKey] = 'demo-secret';
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

    test('requires DEMO_API_KEY outside local runtime', () => {
        process.env[ENV_VARS.nodeEnv] = 'production';
        delete process.env[ENV_VARS.demoApiKey];

        expect(() => validateRuntimeConfig()).toThrow('Missing required environment variable outside local runtime: DEMO_API_KEY');
    });

    test('warns instead of failing when DEMO_API_KEY is missing locally', () => {
        process.env[ENV_VARS.nodeEnv] = 'development';
        delete process.env[ENV_VARS.demoApiKey];

        expect(() => validateRuntimeConfig()).not.toThrow();
        expect(warnSpy).toHaveBeenCalledWith(
            'DEMO_API_KEY is not set. Expensive demo endpoints are not API-key gated in local runtime.'
        );
    });
});
