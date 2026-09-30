import {describe, expect, test} from '@jest/globals';
import {normalizeDrugName} from './normalization.js';

describe('normalization utils', () => {
    test('normalizes drug names for duplicate detection', () => {
        expect(normalizeDrugName('  IBUPROFEN   Sodium  ')).toBe('ibuprofen sodium');
    });
});
