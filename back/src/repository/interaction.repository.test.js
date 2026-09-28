import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const findOne = jest.fn();
const findOneAndUpdate = jest.fn();

jest.unstable_mockModule('../models/Interaction.model.js', () => ({
    Interaction: {
        findOne,
        findOneAndUpdate
    }
}));

const {
    getInteractionPair,
    toCanonicalPair,
    upsertInteraction
} = await import('./interaction.repository.js');

describe('interaction repository', () => {
    beforeEach(() => {
        findOne.mockReset();
        findOneAndUpdate.mockReset();
    });

    test('canonical pair is stable for reversed ids', () => {
        expect(toCanonicalPair('b-id', 'a-id')).toEqual(['a-id', 'b-id']);
        expect(toCanonicalPair('a-id', 'b-id')).toEqual(['a-id', 'b-id']);
    });

    test('upsertInteraction stores ids in canonical order', async () => {
        findOneAndUpdate.mockResolvedValue({drugA: 'a-id', drugB: 'b-id'});

        await upsertInteraction({
            drugA: 'b-id',
            drugB: 'a-id',
            riskLevel: 'moderate',
            colorCode: 'yellow'
        });

        expect(findOneAndUpdate).toHaveBeenCalledWith(
            {drugA: 'a-id', drugB: 'b-id'},
            {$set: {riskLevel: 'moderate', colorCode: 'yellow'}},
            {upsert: true, returnDocument: 'after', runValidators: true}
        );
    });

    test('getInteractionPair checks both current and legacy pair order', async () => {
        findOne.mockResolvedValue(null);

        await getInteractionPair('drug-a', 'drug-b');

        expect(findOne).toHaveBeenCalledWith({
            $or: [
                {drugA: 'drug-a', drugB: 'drug-b'},
                {drugA: 'drug-b', drugB: 'drug-a'}
            ]
        });
    });
});
