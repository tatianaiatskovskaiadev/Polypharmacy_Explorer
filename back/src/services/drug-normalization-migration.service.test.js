import {describe, expect, test} from '@jest/globals';
import {buildNormalizedNameBackfillPlan} from './drug-normalization-migration.service.js';

describe('drug normalization migration service', () => {
    test('plans normalizedName updates for missing or stale values', () => {
        const result = buildNormalizedNameBackfillPlan([
            {_id: '1', name: ' Ibuprofen  200 MG '},
            {_id: '2', name: 'Aspirin', normalizedName: 'aspirin'}
        ]);

        expect(result.duplicates).toEqual([]);
        expect(result.updates).toEqual([
            {
                _id: '1',
                name: ' Ibuprofen  200 MG ',
                normalizedName: 'ibuprofen 200 mg'
            }
        ]);
    });

    test('reports duplicate normalized names before unique index creation', () => {
        const result = buildNormalizedNameBackfillPlan([
            {_id: '1', name: 'Ibuprofen'},
            {_id: '2', name: ' ibuprofen '}
        ]);

        expect(result.duplicates).toEqual([
            {
                normalizedName: 'ibuprofen',
                items: [
                    {_id: '1', name: 'Ibuprofen'},
                    {_id: '2', name: ' ibuprofen '}
                ]
            }
        ]);
    });
});
