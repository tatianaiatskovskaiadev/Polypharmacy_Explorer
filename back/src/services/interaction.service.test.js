import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import {ExternalServiceError} from '../utils/errors.js';

const getDrugsByIds = jest.fn();
const checkInteractionRepository = jest.fn();
const getInteractionPair = jest.fn();
const toCanonicalPair = jest.fn((drugIdA, drugIdB) => [String(drugIdA), String(drugIdB)].sort());
const fetchInteractionFromFDA = jest.fn();
const fetchInteractionFromDailyMed = jest.fn();
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
    fetchInteractionFromFDA
}));

jest.unstable_mockModule('./dailymed.service.js', () => ({fetchInteractionFromDailyMed}));

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
        fetchInteractionFromFDA.mockReset();
        fetchInteractionFromDailyMed.mockReset().mockResolvedValue(null);
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
        fetchInteractionFromFDA.mockImplementation(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await deferred.promise;
            inFlight--;
            return {text: 'FDA interaction text', source: 'openFDA', sourceUrl: 'https://api.fda.gov/example'};
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

        expect(fetchInteractionFromFDA).toHaveBeenCalledTimes(3);
        expect(maxInFlight).toBe(3);

        deferred.resolve();
        await resultPromise;

        expect(fetchInteractionFromFDA).toHaveBeenCalledTimes(6);
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
        fetchInteractionFromFDA.mockImplementation(async () => {
            await deferred.promise;
            return {text: 'FDA interaction text', source: 'openFDA', sourceUrl: 'https://api.fda.gov/example'};
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

        expect(fetchInteractionFromFDA).toHaveBeenCalledTimes(1);
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

    test('returns current cached interaction without reanalysis', async () => {
        const cachedInteraction = {
            _id: 'interaction-1',
            drugA: 'drug-a',
            drugB: 'drug-b',
            analysisVersion: 4
        };

        getInteractionPair.mockResolvedValueOnce(cachedInteraction);

        await expect(syncInteraction('drug-a', 'drug-b', 'A', 'B')).resolves.toBe(cachedInteraction);

        expect(fetchInteractionFromFDA).not.toHaveBeenCalled();
        expect(normalizeInteractionText).not.toHaveBeenCalled();
        expect(upsertInteraction).not.toHaveBeenCalled();
    });

    test('reanalyzes stale cached interaction and keeps edge visible', async () => {
        const cachedInteraction = {
            _id: 'interaction-1',
            drugA: 'drug-a',
            drugB: 'drug-b',
            analysisVersion: 2
        };

        getInteractionPair.mockResolvedValueOnce(cachedInteraction);
        fetchInteractionFromFDA.mockResolvedValueOnce({
            text: 'FDA text with required dose reduction',
            source: 'openFDA',
            sourceUrl: 'https://api.fda.gov/example'
        });
        normalizeInteractionText.mockResolvedValueOnce({
            riskLevel: 'major',
            description: 'Dose reduction is required.',
            actionRequired: 'Limit dose and monitor patient.'
        });
        upsertInteraction.mockResolvedValueOnce({riskLevel: 'major'});

        await syncInteraction('drug-a', 'drug-b', 'A', 'B');

        expect(normalizeInteractionText).toHaveBeenCalledWith(
            'FDA text with required dose reduction',
            {
                drugNameA: 'A',
                drugNameB: 'B'
            }
        );
        expect(upsertInteraction).toHaveBeenCalledWith(expect.objectContaining({
            riskLevel: 'major',
            colorCode: 'orange',
            analysisVersion: 4,
            source: 'openFDA',
            sourceUrl: 'https://api.fda.gov/example',
            sourceText: 'FDA text with required dose reduction'
        }));
    });

    test('falls back to stale cached interaction when reanalysis has no FDA text', async () => {
        const cachedInteraction = {
            _id: 'interaction-1',
            drugA: 'drug-a',
            drugB: 'drug-b',
            analysisVersion: 2
        };

        getInteractionPair.mockResolvedValueOnce(cachedInteraction);
        fetchInteractionFromFDA.mockResolvedValueOnce(null);

        await expect(syncInteraction('drug-a', 'drug-b', 'A', 'B')).resolves.toBe(cachedInteraction);
        expect(normalizeInteractionText).not.toHaveBeenCalled();
        expect(upsertInteraction).not.toHaveBeenCalled();
    });

    test('uses DailyMed when FDA has no pair evidence and saves its provenance', async () => {
        getInteractionPair.mockResolvedValueOnce(null);
        fetchInteractionFromFDA.mockResolvedValueOnce(null);
        fetchInteractionFromDailyMed.mockResolvedValueOnce({
            text: 'Fluconazole may enhance the effect of warfarin.',
            source: 'DailyMed (NLM)',
            sourceUrl: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=example'
        });
        normalizeInteractionText.mockResolvedValueOnce({
            riskLevel: 'moderate',
            description: 'Monitor anticoagulation.',
            actionRequired: 'Monitor closely.'
        });
        upsertInteraction.mockResolvedValueOnce({riskLevel: 'moderate'});

        await syncInteraction('drug-a', 'drug-b', 'fluconazole', 'warfarin');

        expect(upsertInteraction).toHaveBeenCalledWith(expect.objectContaining({
            source: 'DailyMed (NLM)',
            sourceUrl: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=example',
            sourceText: 'Fluconazole may enhance the effect of warfarin.',
            sourceRetrievedAt: expect.any(Date)
        }));
    });

    test('does not create an interaction without explicit evidence from any source', async () => {
        getInteractionPair.mockResolvedValueOnce(null);
        fetchInteractionFromFDA.mockResolvedValueOnce(null);
        await expect(syncInteraction('drug-a', 'drug-b', 'A', 'B')).resolves.toBeNull();
        expect(fetchInteractionFromDailyMed).toHaveBeenCalled();
        expect(normalizeInteractionText).not.toHaveBeenCalled();
        expect(upsertInteraction).not.toHaveBeenCalled();
    });

    test('continues to DailyMed when FDA is unavailable', async () => {
        getInteractionPair.mockResolvedValueOnce(null);
        fetchInteractionFromFDA.mockRejectedValueOnce(new ExternalServiceError('FDA unavailable'));
        fetchInteractionFromDailyMed.mockResolvedValueOnce({
            text: 'Warfarin and fluconazole interaction.',
            source: 'DailyMed (NLM)',
            sourceUrl: 'https://dailymed.nlm.nih.gov/example'
        });
        normalizeInteractionText.mockResolvedValueOnce({
            riskLevel: 'moderate', description: 'Interaction.', actionRequired: 'Monitor.'
        });
        upsertInteraction.mockResolvedValueOnce({riskLevel: 'moderate'});

        await syncInteraction('drug-a', 'drug-b', 'warfarin', 'fluconazole');

        expect(upsertInteraction).toHaveBeenCalledWith(expect.objectContaining({source: 'DailyMed (NLM)'}));
    });

    test('continues interaction check when one external pair sync is rate limited', async () => {
        const drugs = [
            {_id: 'drug-a', name: 'A'},
            {_id: 'drug-b', name: 'B'}
        ];
        const cachedInteractions = [
            {_id: 'cached-interaction', drugA: 'drug-a', drugB: 'drug-b'}
        ];

        getDrugsByIds.mockResolvedValueOnce(drugs);
        getInteractionPair.mockResolvedValue(null);
        fetchInteractionFromFDA.mockRejectedValueOnce(new ExternalServiceError('openFDA responded with 500 Internal Server Error'));
        checkInteractionRepository.mockResolvedValue(cachedInteractions);

        await expect(checkInteraction(['drug-a', 'drug-b'])).resolves.toEqual({
            interactions: cachedInteractions,
            failedPairs: [
                {
                    drugIdA: 'drug-a',
                    drugIdB: 'drug-b',
                    drugNameA: 'A',
                    drugNameB: 'B',
                    reason: 'openFDA responded with 500 Internal Server Error'
                }
            ]
        });
        expect(checkInteractionRepository).toHaveBeenCalledWith(['drug-a', 'drug-b']);
    });

    test('returns empty partial response when fewer than two drugs are selected', async () => {
        await expect(checkInteraction(['drug-a'])).resolves.toEqual({
            interactions: [],
            failedPairs: []
        });
        expect(getDrugsByIds).not.toHaveBeenCalled();
        expect(checkInteractionRepository).not.toHaveBeenCalled();
    });
});
