import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const createVector = jest.fn();
const fetchAnaloguesFromFDA = jest.fn();
const createDrug = jest.fn();
const getDrugByName = jest.fn();
const updateDrug = jest.fn();

jest.unstable_mockModule('./ai.service.js', () => ({
    createVector
}));

jest.unstable_mockModule('./fda.service.js', () => ({
    fetchAnaloguesFromFDA
}));

jest.unstable_mockModule('../repository/drug.repository.js', () => ({
    createDrug,
    getDrugByName,
    updateDrug
}));

const {getSimilarDrugs} = await import('./drug.service.js');

describe('drug service', () => {
    beforeEach(() => {
        createVector.mockReset();
        fetchAnaloguesFromFDA.mockReset();
        createDrug.mockReset();
        getDrugByName.mockReset();
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

    test('reuses cached FDA guidelines and embedding for existing drugs', async () => {
        const cachedDrug = {
            _id: 'drug-1',
            name: 'Ibuprofen',
            activeIngredient: 'ibuprofen',
            guidelines: {
                originalText: 'cached FDA text',
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
                warnings: ['fresh FDA warning text']
            }
        ]);

        await expect(getSimilarDrugs('ibuprofen')).resolves.toEqual([cachedDrug]);
        expect(createVector).not.toHaveBeenCalled();
        expect(updateDrug).not.toHaveBeenCalled();
    });

    test('refreshes existing drug only when cached embedding is missing', async () => {
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
                embedding: [0.3, 0.4]
            }
        });

        await getSimilarDrugs('ibuprofen');

        expect(createVector).toHaveBeenCalledTimes(1);
        expect(updateDrug).toHaveBeenCalledTimes(1);
    });
});
