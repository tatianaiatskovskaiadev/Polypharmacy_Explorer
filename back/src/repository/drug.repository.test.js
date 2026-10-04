import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const create = jest.fn();
const find = jest.fn();
const findByIdAndUpdate = jest.fn();
const findOneAndUpdate = jest.fn();
const aggregate = jest.fn();

jest.unstable_mockModule('../models/Drug.model.js', () => ({
    Drug: {
        create,
        find,
        findByIdAndUpdate,
        findOneAndUpdate,
        aggregate
    }
}));

const {
    createDrug,
    getDrugByName,
    getDrugsByIds,
    upsertInternationalDrug,
    updateDrug
} = await import('./drug.repository.js');

describe('drug repository', () => {
    beforeEach(() => {
        create.mockReset();
        find.mockReset();
        findByIdAndUpdate.mockReset();
        findOneAndUpdate.mockReset();
        aggregate.mockReset();
    });

    test('stores normalizedName on create', async () => {
        create.mockResolvedValueOnce({});

        await createDrug({
            name: '  IBUPROFEN   Sodium  ',
            activeIngredient: 'ibuprofen sodium'
        });

        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            name: '  IBUPROFEN   Sodium  ',
            normalizedName: 'ibuprofen sodium'
        }));
    });

    test('inserts an international catalog entry without overwriting an existing drug', async () => {
        findOneAndUpdate.mockResolvedValueOnce({name: 'Suprastin'});

        await upsertInternationalDrug({
            name: 'Suprastin',
            activeIngredient: 'chloropyramine',
            source: 'Hungarian drug database',
            sourceUrl: 'https://example.com/source'
        });

        expect(findOneAndUpdate).toHaveBeenCalledWith(
            {normalizedName: 'suprastin'},
            {$setOnInsert: expect.objectContaining({
                activeIngredient: 'chloropyramine',
                guidelines: {source: 'Hungarian drug database', sourceUrl: 'https://example.com/source'}
            })},
            {upsert: true, returnDocument: 'after', runValidators: true}
        );
    });

    test('searches by normalized exact name and case-insensitive display name', async () => {
        find.mockResolvedValueOnce([]);

        await getDrugByName('  IBUPROFEN   Sodium  ');

        expect(find).toHaveBeenCalledWith({
            $or: [
                {normalizedName: 'ibuprofen sodium'},
                {name: {$regex: 'IBUPROFEN   Sodium', $options: 'i'}}
            ]
        });
    });

    test('excludes stored embeddings from search lists', async () => {
        const select = jest.fn().mockResolvedValueOnce([]);
        find.mockReturnValueOnce({select});

        await getDrugByName('warfarin', {excludeEmbedding: true});

        expect(select).toHaveBeenCalledWith('-guidelines.embedding');
    });

    test('excludes stored embeddings when loading cached results', async () => {
        const select = jest.fn().mockResolvedValueOnce([]);
        find.mockReturnValueOnce({select});

        await getDrugsByIds(['drug-1']);

        expect(select).toHaveBeenCalledWith('-guidelines.embedding');
    });

    test('updates normalizedName when display name changes', async () => {
        findByIdAndUpdate.mockResolvedValueOnce({});

        await updateDrug('drug-id', {
            name: '  Tylenol  Extra  Strength ',
            activeIngredient: 'acetaminophen'
        });

        expect(findByIdAndUpdate).toHaveBeenCalledWith(
            'drug-id',
            {
                $set: {
                    name: '  Tylenol  Extra  Strength ',
                    activeIngredient: 'acetaminophen',
                    normalizedName: 'tylenol extra strength'
                }
            },
            {
                returnDocument: 'after',
                runValidators: true
            }
        );
    });
});
