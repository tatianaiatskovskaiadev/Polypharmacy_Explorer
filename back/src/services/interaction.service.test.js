import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const getDrugsByIds = jest.fn();
const checkInteractionRepository = jest.fn();
const getInteractionPair = jest.fn();
const toCanonicalPair = jest.fn((drugIdA, drugIdB) => [String(drugIdA), String(drugIdB)].sort());
const fetchRawInteraction = jest.fn();
const normalizeInteractionText = jest.fn();
const upsertInteraction = jest.fn();

jest.unstable_mockModule('../repository/drug.repository.js', () => ({
    getDrugsByIds
}));

jest.unstable_mockModule('../repository/interaction.repository.js', () => ({
    checkInteraction: checkInteractionRepository,
    getInteractionPair,
    toCanonicalPair,
    upsertInteraction
}));

jest.unstable_mockModule('./fda.service.js', () => ({
    fetchRawInteraction
}));

jest.unstable_mockModule('./ai.service.js', () => ({
    normalizeInteractionText
}));

const {checkInteraction, syncInteraction} = await import('./interaction.service.js');

const createDeferred = () => {
    let resolve;
    const promise = new Promise((promiseResolve) => {
        resolve = promiseResolve;
    });
    return {promise, resolve};
};

describe('interaction service', () => {
    beforeEach(() => {
        getDrugsByIds.mockReset();
        checkInteractionRepository.mockReset();
        getInteractionPair.mockReset();
        toCanonicalPair.mockClear();
        fetchRawInteraction.mockReset();
        normalizeInteractionText.mockReset();
        upsertInteraction.mockReset();
    });

    test('syncs cold interaction pairs with bounded concurrency', async () => {
        const drugs = [
            {_id: 'drug-a', name: 'A'},
            {_id: 'drug-b', name: 'B'},
            {_id: 'drug-c', name: 'C'},
            {_id: 'drug-d', name: 'D'}
        ];
        const deferred = createDeferred();
        let inFlight = 0;
        let maxInFlight = 0;

        getDrugsByIds.mockResolvedValueOnce(drugs);
        getInteractionPair.mockResolvedValue(null);
        fetchRawInteraction.mockImplementation(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await deferred.promise;
            inFlight--;
            return 'FDA interaction text';
        });
        normalizeInteractionText.mockResolvedValue({
            riskLevel: 'moderate',
            description: 'Interaction summary',
            actionRequired: 'Monitor patient'
        });
        upsertInteraction.mockResolvedValue({});
        checkInteractionRepository.mockResolvedValue([]);

        const resultPromise = checkInteraction(drugs.map((drug) => drug._id));

        await Promise.resolve();
        await Promise.resolve();

        expect(fetchRawInteraction).toHaveBeenCalledTimes(3);
        expect(maxInFlight).toBe(3);

        deferred.resolve();
        await resultPromise;

        expect(fetchRawInteraction).toHaveBeenCalledTimes(6);
        expect(maxInFlight).toBe(3);
    });

    test('deduplicates concurrent cold syncs for the same canonical pair', async () => {
        const deferred = createDeferred();
        const savedInteraction = {
            _id: 'interaction-1',
            drugA: 'drug-a',
            drugB: 'drug-b'
        };

        getInteractionPair.mockResolvedValue(null);
        fetchRawInteraction.mockImplementation(async () => {
            await deferred.promise;
            return 'FDA interaction text';
        });
        normalizeInteractionText.mockResolvedValue({
            riskLevel: 'moderate',
            description: 'Interaction summary',
            actionRequired: 'Monitor patient'
        });
        upsertInteraction.mockResolvedValue(savedInteraction);

        const firstSync = syncInteraction('drug-a', 'drug-b', 'A', 'B');
        const secondSync = syncInteraction('drug-b', 'drug-a', 'B', 'A');

        await Promise.resolve();
        await Promise.resolve();

        expect(fetchRawInteraction).toHaveBeenCalledTimes(1);
        expect(normalizeInteractionText).not.toHaveBeenCalled();

        deferred.resolve();

        await expect(Promise.all([firstSync, secondSync])).resolves.toEqual([
            savedInteraction,
            savedInteraction
        ]);
        expect(getInteractionPair).toHaveBeenCalledTimes(1);
        expect(normalizeInteractionText).toHaveBeenCalledTimes(1);
        expect(upsertInteraction).toHaveBeenCalledTimes(1);
    });
});
