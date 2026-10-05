import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const findOne = jest.fn();
const findOneAndUpdate = jest.fn();
const aggregate = jest.fn();
const listSearchIndexes = jest.fn();
const toArray = jest.fn();

jest.unstable_mockModule('../models/Interaction.model.js', () => ({
    Interaction: {
        findOne,
        findOneAndUpdate,
        aggregate,
        collection: {listSearchIndexes}
    }
}));

const {
    getInteractionPair,
    toCanonicalPair,
    upsertInteraction,
    searchInteractionsByVector
} = await import('./interaction.repository.js');

describe('interaction repository', () => {
    beforeEach(() => {
        findOne.mockReset();
        findOneAndUpdate.mockReset();
        aggregate.mockReset();
        listSearchIndexes.mockReset().mockReturnValue({toArray});
        toArray.mockReset().mockResolvedValue([{name: 'interaction_vector_index', queryable: true}]);
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

    test('searches only selected interaction pairs with a vector score cutoff', async () => {
        aggregate.mockResolvedValueOnce([{description: 'Elevation of prothrombin times', score: 0.8}]);
        const ids = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'];

        await expect(searchInteractionsByVector([0.1, 0.2], ids)).resolves.toHaveLength(1);
        const pipeline = aggregate.mock.calls[0][0];
        expect(pipeline[0].$vectorSearch).toMatchObject({
            index: 'interaction_vector_index',
            path: 'embedding',
            queryVector: [0.1, 0.2],
            limit: 3,
            filter: {
                drugA: {$in: expect.any(Array)},
                drugB: {$in: expect.any(Array)}
            }
        });
        expect(pipeline[1]).toEqual({$set: {score: {$meta: 'vectorSearchScore'}}});
        expect(pipeline[2]).toEqual({$match: {score: {$gte: 0.6}}});
        expect(pipeline[3].$project).toMatchObject({embedding: 0, searchText: 0});
    });

    test('does not query vectors when fewer than two drugs are selected', async () => {
        await expect(searchInteractionsByVector([0.1], ['507f1f77bcf86cd799439011'])).resolves.toEqual([]);
        expect(listSearchIndexes).not.toHaveBeenCalled();
        expect(aggregate).not.toHaveBeenCalled();
    });

    test('reports a missing index instead of presenting false empty results', async () => {
        toArray.mockResolvedValueOnce([]);
        await expect(searchInteractionsByVector([0.1], [
            '507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'
        ])).rejects.toThrow('Interaction search index is not ready');
        expect(aggregate).not.toHaveBeenCalled();
    });
});
