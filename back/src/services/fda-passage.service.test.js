import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const createVectors = jest.fn();
const getPassagesByDrugId = jest.fn();
const replacePassages = jest.fn();

jest.unstable_mockModule('./ai.service.js', () => ({createVectors}));
jest.unstable_mockModule('../repository/fda-passage.repository.js', () => ({
    getPassagesByDrugId,
    replacePassages
}));

const {buildFdaPassages, indexFdaPassages} = await import('./fda-passage.service.js');

describe('FDA passage indexing', () => {
    beforeEach(() => {
        createVectors.mockReset();
        getPassagesByDrugId.mockReset();
        replacePassages.mockReset();
    });

    test('keeps the label identity and section for citations', () => {
        const passages = buildFdaPassages({
            id: 'label-1',
            drug_interactions: ['Drug B increases bleeding risk.']
        }, 'drug-1', 'Drug A');

        expect(passages).toEqual([expect.objectContaining({
            drugId: 'drug-1',
            drugName: 'Drug A',
            labelId: 'label-1',
            section: 'drug_interactions',
            text: 'Drug B increases bleeding risk.',
            sourceUrl: expect.stringContaining('label-1')
        })]);
    });

    test('splits long interaction text before lower-priority sections', () => {
        const passages = buildFdaPassages({
            id: 'label-2',
            warnings: ['Warning text.'],
            drug_interactions: ['Interaction text. '.repeat(130)]
        }, 'drug-1', 'Drug A');

        expect(passages.length).toBeGreaterThan(2);
        expect(passages[0].section).toBe('drug_interactions');
        expect(passages.at(-1).section).toBe('warnings');
        expect(passages.every((passage) => passage.text.length <= 1000)).toBe(true);
    });

    test('reuses matching embeddings and refreshes changed passages', async () => {
        const label = {id: 'label-1', drug_interactions: ['Current FDA text.']};
        getPassagesByDrugId.mockResolvedValueOnce([]);
        createVectors.mockResolvedValueOnce([[0.1, 0.2]]);
        replacePassages.mockResolvedValueOnce();

        await indexFdaPassages(label, 'drug-1', 'Drug A');
        const stored = replacePassages.mock.calls[0][1][0];
        expect(stored.embedding).toEqual([0.1, 0.2]);

        getPassagesByDrugId.mockResolvedValueOnce([stored]);
        replacePassages.mockResolvedValueOnce();
        await indexFdaPassages(label, 'drug-1', 'Drug A');
        expect(createVectors).toHaveBeenCalledTimes(1);
        expect(replacePassages.mock.calls[1][1][0].embedding).toEqual([0.1, 0.2]);
    });
});
