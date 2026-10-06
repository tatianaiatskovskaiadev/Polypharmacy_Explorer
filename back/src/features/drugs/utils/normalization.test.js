import {describe, expect, test} from '@jest/globals';
import {normalizeDrugName} from './normalization.js';

describe('normalization helper', () => {
    test('normalizes drug names for duplicate detection', () => {
        expect(normalizeDrugName('  IBUPROFEN   Sodium  ')).toBe('ibuprofen sodium');
    });
});
