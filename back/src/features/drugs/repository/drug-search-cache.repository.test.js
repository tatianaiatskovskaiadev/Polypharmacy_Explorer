import {beforeEach, expect, jest, test} from '@jest/globals';
import {DRUG_SEARCH_VERSION} from '../../../utils/constants.js';

const findOne = jest.fn();
const findOneAndUpdate = jest.fn();

jest.unstable_mockModule('../models/DrugSearchCache.model.js', () => ({
    DrugSearchCache: {findOne, findOneAndUpdate}
}));

const {getCachedDrugIds, saveSearchResult} = await import('./drug-search-cache.repository.js');

beforeEach(() => {
    findOne.mockReset();
    findOneAndUpdate.mockReset();
});

test('ignores cached searches created by an older resolution pipeline', async () => {
    const lean = jest.fn().mockResolvedValueOnce(null);
    findOne.mockReturnValueOnce({lean});

    await expect(getCachedDrugIds('dimedrol')).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
        query: 'dimedrol',
        searchVersion: DRUG_SEARCH_VERSION
    }));
});

test('saves resolved search results with the current pipeline version', async () => {
    await saveSearchResult('dimedrol', [{_id: 'drug-1'}]);

    expect(findOneAndUpdate).toHaveBeenCalledWith(
        {query: 'dimedrol'},
        {$set: expect.objectContaining({
            drugIds: ['drug-1'],
            searchVersion: DRUG_SEARCH_VERSION
        })},
        {upsert: true}
    );
});
