import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import {createHash} from 'crypto';

const createVector = jest.fn();
const fetchAnaloguesFromFDA = jest.fn();
const createDrug = jest.fn();
const getDrugByName = jest.fn();
const updateDrug = jest.fn();
const getDrug = jest.fn();
const searchInteractionsByText = jest.fn();

jest.unstable_mockModule('./ai.service.js', () => ({
    createVector
}));

jest.unstable_mockModule('./fda.service.js', () => ({
    fetchAnaloguesFromFDA
}));

jest.unstable_mockModule('../repository/drug.repository.js', () => ({
    createDrug,
    getDrug,
    getDrugByName,
    updateDrug
}));

jest.unstable_mockModule('../repository/interaction.repository.js', () => ({
    searchInteractionsByText
}));

const {getSimilarDrugs, searchDrugsBySymptom} = await import('./drug.service.js');

const contentHash = (text) => createHash('sha256').update(text).digest('hex');

describe('drug service', () => {
    beforeEach(() => {
        createVector.mockReset();
        fetchAnaloguesFromFDA.mockReset();
        createDrug.mockReset();
        getDrug.mockReset();
        getDrugByName.mockReset();
        searchInteractionsByText.mockReset();
        updateDrug.mockReset();
    });

    test('returns local drugs when FDA analogue search has no results', async () => {
        const localDrug = {
            _id: 'drug-1',
            name: 'Aspirin',
            activeIngredient: 'aspirin'
        };
        getDrugByName.mockResolvedValueOnce([localDrug]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([]);

        await expect(getSimilarDrugs('aspirin')).resolves.toEqual([localDrug]);
        expect(createVector).not.toHaveBeenCalled();
        expect(createDrug).not.toHaveBeenCalled();
    });

    test('uses the most relevant local match for FDA analogue search', async () => {
        getDrugByName.mockResolvedValueOnce([
            {
                _id: 'combo-drug',
                name: 'Omeprazole and Clarithromycin and Amoxicillin',
                activeIngredient: 'CLARITHROMYCIN'
            },
            {
                _id: 'exact-drug',
                name: 'Amoxicillin',
                activeIngredient: 'AMOXICILLIN'
            }
        ]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([]);

        await getSimilarDrugs('amoxicillin');

        expect(fetchAnaloguesFromFDA).toHaveBeenCalledWith('AMOXICILLIN');
    });

    test('ranks single-ingredient FDA analogues before combination products', async () => {
        getDrugByName
            .mockResolvedValueOnce([
                {
                    _id: 'local-metformin',
                    name: 'METFORMIN',
                    activeIngredient: 'METFORMIN'
                }
            ])
            .mockResolvedValue([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([
            {
                openfda: {
                    brand_name: ['ZITUVIMET'],
                    generic_name: ['SITAGLIPTIN AND METFORMIN HYDROCHLORIDE']
                },
                description: ['combo description']
            },
            {
                openfda: {
                    brand_name: ['METFORMIN HYDROCHLORIDE'],
                    generic_name: ['METFORMIN HYDROCHLORIDE']
                },
                description: ['single ingredient description']
            }
        ]);
        createVector
            .mockResolvedValueOnce([0.1])
            .mockResolvedValueOnce([0.2]);
        createDrug.mockImplementation(async (drug) => drug);

        const result = await getSimilarDrugs('metformin');

        expect(result.map((drug) => drug.name)).toEqual([
            'METFORMIN',
            'METFORMIN HYDROCHLORIDE',
            'ZITUVIMET'
        ]);
    });

    test('saves FDA analogue when only description text is available', async () => {
        getDrugByName
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([
            {
                openfda: {
                    brand_name: ['TestDrug'],
                    generic_name: ['test ingredient']
                },
                description: ['FDA description text']
            }
        ]);
        createVector.mockResolvedValueOnce([0.1, 0.2, 0.3]);
        createDrug.mockResolvedValueOnce({name: 'TestDrug'});

        await expect(getSimilarDrugs('TestDrug')).resolves.toEqual([{name: 'TestDrug'}]);
        expect(createDrug).toHaveBeenCalledWith(expect.objectContaining({
            name: 'TestDrug',
            activeIngredient: 'test ingredient',
            guidelines: expect.objectContaining({
                source: 'FDA',
                originalText: 'FDA description text',
                contentHash: contentHash('FDA description text'),
                embedding: [0.1, 0.2, 0.3]
            })
        }));
    });

    test('limits long FDA label text before creating an embedding', async () => {
        getDrugByName
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([
            {
                openfda: {
                    brand_name: ['LongLabelDrug'],
                    generic_name: ['long label ingredient']
                },
                warnings: ['w'.repeat(10_000)],
                description: ['d'.repeat(10_000)]
            }
        ]);
        createVector.mockResolvedValueOnce([0.1]);
        createDrug.mockResolvedValueOnce({name: 'LongLabelDrug'});

        await getSimilarDrugs('LongLabelDrug');

        expect(createVector).toHaveBeenCalledWith(expect.any(String));
        expect(createVector.mock.calls[0][0].length).toBeLessThanOrEqual(6_000);
    });

    test('reuses cached FDA guidelines and embedding when content hash matches', async () => {
        const currentText = 'fresh FDA warning text';
        const cachedDrug = {
            _id: 'drug-1',
            name: 'Ibuprofen',
            activeIngredient: 'ibuprofen',
            guidelines: {
                originalText: currentText,
                contentHash: contentHash(currentText),
                embedding: [0.1, 0.2]
            }
        };

        getDrugByName
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([cachedDrug]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([
            {
                openfda: {
                    brand_name: ['Ibuprofen'],
                    generic_name: ['ibuprofen']
                },
                warnings: [currentText]
            }
        ]);

        await expect(getSimilarDrugs('ibuprofen')).resolves.toEqual([cachedDrug]);
        expect(createVector).not.toHaveBeenCalled();
        expect(updateDrug).not.toHaveBeenCalled();
    });

    test('refreshes existing drug when cached embedding is missing', async () => {
        const staleDrug = {
            _id: 'drug-1',
            name: 'Ibuprofen',
            activeIngredient: 'ibuprofen',
            guidelines: {
                originalText: 'old FDA text',
                embedding: []
            }
        };

        getDrugByName
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([staleDrug]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([
            {
                openfda: {
                    brand_name: ['Ibuprofen'],
                    generic_name: ['ibuprofen']
                },
                warnings: ['fresh FDA warning text']
            }
        ]);
        createVector.mockResolvedValueOnce([0.3, 0.4]);
        updateDrug.mockResolvedValueOnce({
            ...staleDrug,
            guidelines: {
                originalText: 'fresh FDA warning text',
                contentHash: contentHash('fresh FDA warning text'),
                embedding: [0.3, 0.4]
            }
        });

        await getSimilarDrugs('ibuprofen');

        expect(createVector).toHaveBeenCalledTimes(1);
        expect(updateDrug).toHaveBeenCalledTimes(1);
    });

    test('refreshes existing drug when FDA guideline hash changed', async () => {
        const changedDrug = {
            _id: 'drug-1',
            name: 'Ibuprofen',
            activeIngredient: 'ibuprofen',
            guidelines: {
                originalText: 'old FDA text',
                contentHash: contentHash('old FDA text'),
                embedding: [0.1, 0.2]
            }
        };

        getDrugByName
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([changedDrug]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([
            {
                openfda: {
                    brand_name: ['Ibuprofen'],
                    generic_name: ['ibuprofen']
                },
                warnings: ['new FDA text']
            }
        ]);
        createVector.mockResolvedValueOnce([0.3, 0.4]);
        updateDrug.mockResolvedValueOnce({
            ...changedDrug,
            guidelines: {
                originalText: 'new FDA text',
                contentHash: contentHash('new FDA text'),
                embedding: [0.3, 0.4]
            }
        });

        await getSimilarDrugs('ibuprofen');

        expect(createVector).toHaveBeenCalledWith('new FDA text');
        expect(updateDrug).toHaveBeenCalledWith('drug-1', expect.objectContaining({
            guidelines: expect.objectContaining({
                originalText: 'new FDA text',
                contentHash: contentHash('new FDA text'),
                embedding: [0.3, 0.4]
            })
        }));
    });

    test('searches symptoms across drug guidelines and saved interaction summaries', async () => {
        const matchingDrug = {_id: 'drug-a', name: 'Warfarin'};
        const matchingInteraction = {
            _id: 'interaction-1',
            drugA: 'drug-a',
            drugB: 'drug-b',
            description: 'Bleeding risk'
        };

        createVector.mockResolvedValueOnce([0.1, 0.2]);
        getDrug.mockResolvedValueOnce([matchingDrug]);
        searchInteractionsByText.mockResolvedValueOnce([matchingInteraction]);

        await expect(searchDrugsBySymptom('bleeding', ['drug-a', 'drug-b'])).resolves.toEqual({
            drugs: [matchingDrug],
            interactions: [matchingInteraction]
        });

        expect(getDrug).toHaveBeenCalledWith([0.1, 0.2], ['drug-a', 'drug-b']);
        expect(searchInteractionsByText).toHaveBeenCalledWith('bleeding', ['drug-a', 'drug-b']);
    });
});
