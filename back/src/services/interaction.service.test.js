import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const getDrugsByIds = jest.fn();
const checkInteractionRepository = jest.fn();
const getInteractionPair = jest.fn();
const fetchRawInteraction = jest.fn();
const normalizeInteractionText = jest.fn();
const upsertInteraction = jest.fn();

jest.unstable_mockModule('../repository/drug.repository.js', () => ({
    getDrugsByIds
}));

jest.unstable_mockModule('../repository/interaction.repository.js', () => ({
    checkInteraction: checkInteractionRepository,
    getInteractionPair,
    upsertInteraction
}));

jest.unstable_mockModule('./fda.service.js', () => ({
    fetchRawInteraction
}));

jest.unstable_mockModule('./ai.service.js', () => ({
    normalizeInteractionText
}));

const {checkInteraction} = await import('./interaction.service.js');

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
});
