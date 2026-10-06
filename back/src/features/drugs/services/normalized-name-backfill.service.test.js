import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const listNamesForBackfill = jest.fn();
const updateNormalizedNames = jest.fn();
const createNormalizedNameIndex = jest.fn();

jest.unstable_mockModule('../repository/drug.repository.js', () => ({
    listNamesForBackfill, updateNormalizedNames, createNormalizedNameIndex
}));

const {backfillNormalizedNames} = await import('./normalized-name-backfill.service.js');

describe('normalized name backfill', () => {
    beforeEach(() => {
        listNamesForBackfill.mockReset();
        updateNormalizedNames.mockReset();
        createNormalizedNameIndex.mockReset();
    });

    test('updates names and creates the unique index', async () => {
        listNamesForBackfill.mockResolvedValue([{_id: 'drug-1', name: ' Aspirin '}]);
        await expect(backfillNormalizedNames()).resolves.toMatchObject({scanned: 1, updateCount: 1, duplicates: []});
        expect(updateNormalizedNames).toHaveBeenCalledWith([expect.objectContaining({normalizedName: 'aspirin'})]);
        expect(createNormalizedNameIndex).toHaveBeenCalledTimes(1);
    });

    test('does not write when normalized names collide', async () => {
        listNamesForBackfill.mockResolvedValue([
            {_id: 'drug-1', name: 'Aspirin'}, {_id: 'drug-2', name: ' ASPIRIN '}
        ]);
        const result = await backfillNormalizedNames();
        expect(result.duplicates).toHaveLength(1);
        expect(updateNormalizedNames).not.toHaveBeenCalled();
        expect(createNormalizedNameIndex).not.toHaveBeenCalled();
    });
});
