import {describe, expect, test} from '@jest/globals';
import {corsOptions} from './corsOptions.js';
import {DEMO_API_KEY_HEADER} from '../utils/constants.js';

describe('cors options', () => {
    test('allows demo API key header for browser preflight requests', () => {
        expect(corsOptions.allowedHeaders).toContain(DEMO_API_KEY_HEADER);
    });
});
