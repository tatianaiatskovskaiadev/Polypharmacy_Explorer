import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const create = jest.fn();
const find = jest.fn();
const findByIdAndUpdate = jest.fn();
const aggregate = jest.fn();

jest.unstable_mockModule('../models/Drug.model.js', () => ({
    Drug: {
        create,
        find,
        findByIdAndUpdate,
        aggregate
    }
}));

const {
    createDrug,
    getDrugByName,
    updateDrug
} = await import('./drug.repository.js');

describe('drug repository', () => {
    beforeEach(() => {
        create.mockReset();
        find.mockReset();
        findByIdAndUpdate.mockReset();
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
