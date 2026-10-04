import {describe, expect, test} from '@jest/globals';
import {corsOptions} from './corsOptions.js';
import {CSRF_TOKEN_HEADER} from '../utils/constants.js';

describe('cors options', () => {
    test('allows credentialed requests with a CSRF header', () => {
        expect(corsOptions.credentials).toBe(true);
        expect(corsOptions.allowedHeaders).toContain(CSRF_TOKEN_HEADER);
        expect(corsOptions.exposedHeaders).toContain('X-Search-Partial');
    });
});
