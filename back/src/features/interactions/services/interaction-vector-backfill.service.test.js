import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const listInteractionSearchIndexes = jest.fn();
const createInteractionSearchIndex = jest.fn();
const iterateInteractionsForBackfill = jest.fn();
const updateInteractionEmbedding = jest.fn();
const createVector = jest.fn();

jest.unstable_mockModule('../repository/interaction.repository.js', () => ({
    listInteractionSearchIndexes, createInteractionSearchIndex,
    iterateInteractionsForBackfill, updateInteractionEmbedding
}));
jest.unstable_mockModule('../../ai/services/ai.service.js', () => ({createVector}));

const {backfillInteractionVectors} = await import('./interaction-vector-backfill.service.js');

describe('interaction vector backfill', () => {
    beforeEach(() => {
        for (const mock of [listInteractionSearchIndexes, createInteractionSearchIndex,
            iterateInteractionsForBackfill, updateInteractionEmbedding, createVector]) mock.mockReset();
        listInteractionSearchIndexes.mockResolvedValue([]);
        iterateInteractionsForBackfill.mockReturnValue([{
            _id: 'interaction-1', description: 'Elevation of prothrombin times',
            actionRequired: 'Monitor INR', riskLevel: 'major'
        }]);
        createVector.mockResolvedValue([0.1, 0.2]);
        updateInteractionEmbedding.mockResolvedValue({modifiedCount: 1});
    });

    test('dry run reports missing index and vectors without writing', async () => {
        await expect(backfillInteractionVectors({dryRun: true})).resolves.toEqual({
            scanned: 1, updated: 1, indexMissing: true
        });
        expect(createInteractionSearchIndex).not.toHaveBeenCalled();
        expect(createVector).not.toHaveBeenCalled();
    });

    test('creates the index and embeds each stale interaction', async () => {
        const onIndexCreated = jest.fn();
        await expect(backfillInteractionVectors({onIndexCreated})).resolves.toEqual({
            scanned: 1, updated: 1, indexMissing: true
        });
        expect(createInteractionSearchIndex).toHaveBeenCalledTimes(1);
        expect(onIndexCreated).toHaveBeenCalledTimes(1);
        expect(createVector).toHaveBeenCalledWith('Elevation of prothrombin times\nMonitor INR\nmajor');
        expect(updateInteractionEmbedding).toHaveBeenCalledWith(
            expect.objectContaining({_id: 'interaction-1'}),
            'Elevation of prothrombin times\nMonitor INR\nmajor', [0.1, 0.2], 'text-embedding-3-small'
        );
    });
});
