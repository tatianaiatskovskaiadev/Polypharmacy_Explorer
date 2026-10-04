import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import {createHash} from 'crypto';
import {DRUG_SEARCH_FALLBACK_CACHE_TTL_MS} from '../utils/constants.js';
import {ExternalServiceError} from '../utils/errors.js';

const createVector = jest.fn();
const createVectors = jest.fn();
const fetchAnaloguesFromFDA = jest.fn();
const findDailyMedDrug = jest.fn();
const resolveIngredientFromPubChem = jest.fn();
const indexFdaPassages = jest.fn();
const createDrug = jest.fn();
const upsertInternationalDrug = jest.fn();
const getDrugsByIds = jest.fn();
const getDrugByName = jest.fn();
const updateDrug = jest.fn();
const getDrug = jest.fn();
const searchInteractionsByText = jest.fn();
const getCachedDrugIds = jest.fn();
const saveSearchResult = jest.fn();

jest.unstable_mockModule('./ai.service.js', () => ({
    createVector,
    createVectors
}));

jest.unstable_mockModule('./fda.service.js', () => ({
    fetchAnaloguesFromFDA
}));

jest.unstable_mockModule('./dailymed.service.js', () => ({findDailyMedDrug}));
jest.unstable_mockModule('./ingredient-resolution.service.js', () => ({resolveIngredientFromPubChem}));
jest.unstable_mockModule('./fda-passage.service.js', () => ({indexFdaPassages}));

jest.unstable_mockModule('../repository/drug.repository.js', () => ({
    createDrug,
    upsertInternationalDrug,
    getDrug,
    getDrugsByIds,
    getDrugByName,
    updateDrug
}));

jest.unstable_mockModule('../repository/drug-search-cache.repository.js', () => ({
    getCachedDrugIds,
    saveSearchResult
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
        findDailyMedDrug.mockReset().mockResolvedValue(null);
        resolveIngredientFromPubChem.mockReset().mockResolvedValue(null);
        indexFdaPassages.mockReset();
        createDrug.mockReset();
        upsertInternationalDrug.mockReset();
        getDrug.mockReset();
        getDrugsByIds.mockReset();
        getDrugByName.mockReset();
        getCachedDrugIds.mockReset();
        saveSearchResult.mockReset();
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
        expect(saveSearchResult).toHaveBeenCalledWith(
            'aspirin', [localDrug], DRUG_SEARCH_FALLBACK_CACHE_TTL_MS
        );
        expect(fetchAnaloguesFromFDA).toHaveBeenCalledWith('aspirin');
    });

    test('stores a DailyMed drug with its source when FDA has no label', async () => {
        getDrugByName.mockResolvedValueOnce([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([]);
        const officialDrug = {
            name: 'warfarin',
            activeIngredient: 'warfarin',
            source: 'DailyMed (NLM)',
            sourceUrl: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=label-id'
        };
        const savedDrug = {_id: 'drug-1', name: 'warfarin', guidelines: officialDrug};
        findDailyMedDrug.mockResolvedValueOnce(officialDrug);
        upsertInternationalDrug.mockResolvedValueOnce(savedDrug);

        await expect(getSimilarDrugs('warfarin')).resolves.toEqual([savedDrug]);
        expect(upsertInternationalDrug).toHaveBeenCalledWith(officialDrug);
        expect(saveSearchResult).toHaveBeenCalledWith('warfarin', [savedDrug]);
    });

    test('resolves Dimedrol to diphenhydramine and verifies it against an FDA ingredient label', async () => {
        const fdaLabel = {
            id: 'label-1',
            openfda: {
                brand_name: ['Diphenhydramine HCl'],
                generic_name: ['DIPHENHYDRAMINE HCL']
            },
            warnings: ['FDA warning text']
        };
        const alias = {_id: 'alias-1', name: 'Dimedrol', activeIngredient: 'DIPHENHYDRAMINE'};
        const analogue = {_id: 'drug-2', name: 'Diphenhydramine HCl', activeIngredient: 'DIPHENHYDRAMINE HCL'};
        getDrugByName.mockResolvedValue([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([]).mockResolvedValueOnce([fdaLabel]);
        resolveIngredientFromPubChem.mockResolvedValueOnce({
            activeIngredient: 'DIPHENHYDRAMINE',
            source: 'PubChem (NIH)',
            sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/8980'
        });
        upsertInternationalDrug.mockResolvedValueOnce(alias);
        createVector.mockResolvedValueOnce([0.1]);
        createDrug.mockResolvedValueOnce(analogue);

        const result = await getSimilarDrugs('Dimedrol');

        expect(fetchAnaloguesFromFDA).toHaveBeenNthCalledWith(1, 'Dimedrol');
        expect(fetchAnaloguesFromFDA).toHaveBeenNthCalledWith(2, 'DIPHENHYDRAMINE');
        expect(upsertInternationalDrug).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Dimedrol',
            activeIngredient: 'DIPHENHYDRAMINE',
            source: 'PubChem (NIH)',
            verificationSource: 'openFDA'
        }));
        expect(result).toEqual([alias, analogue]);
        expect(saveSearchResult).toHaveBeenCalledWith('dimedrol', [alias, analogue]);
    });

    test('saves a PubChem-only chemical identity without presenting it as label evidence', async () => {
        getDrugByName.mockResolvedValueOnce([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([]).mockResolvedValueOnce([{
            openfda: {generic_name: ['OTHER INGREDIENT AND DIPHENHYDRAMINE']}
        }]);
        resolveIngredientFromPubChem.mockResolvedValueOnce({
            activeIngredient: 'DIPHENHYDRAMINE',
            source: 'PubChem (NIH)',
            sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/8980'
        });

        const alias = {_id: 'alias-1', name: 'Dimedrol', activeIngredient: 'DIPHENHYDRAMINE'};
        upsertInternationalDrug.mockResolvedValueOnce(alias);

        await expect(getSimilarDrugs('Dimedrol')).resolves.toEqual([alias]);
        expect(upsertInternationalDrug).toHaveBeenCalledWith(expect.not.objectContaining({
            verificationSource: expect.any(String)
        }));
    });

    test('skips empty ingredient labels before applying the analogue limit', async () => {
        const activeIngredient = 'DIPHENHYDRAMINE';
        const emptyLabels = Array.from({length: 12}, (_, index) => ({
            openfda: {
                brand_name: [`Empty ${index}`],
                generic_name: [activeIngredient]
            }
        }));
        const validLabel = {
            openfda: {
                brand_name: ['Valid label'],
                generic_name: [activeIngredient]
            },
            warnings: ['FDA warning']
        };
        getDrugByName.mockResolvedValue([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([])
            .mockResolvedValueOnce([...emptyLabels, validLabel]);
        resolveIngredientFromPubChem.mockResolvedValueOnce({
            activeIngredient,
            source: 'PubChem (NIH)',
            sourceUrl: 'https://example.com/chemical'
        });
        const alias = {_id: 'alias-1', name: 'Dimedrol', activeIngredient};
        const analogue = {_id: 'analogue-1', name: 'Valid label', activeIngredient};
        upsertInternationalDrug.mockResolvedValueOnce(alias);
        createVector.mockResolvedValueOnce([0.1]);
        createDrug.mockResolvedValueOnce(analogue);

        await expect(getSimilarDrugs('Dimedrol')).resolves.toEqual([alias, analogue]);
        expect(createDrug).toHaveBeenCalledTimes(1);
    });

    test('uses a DailyMed ingredient label when FDA has no matching label', async () => {
        getDrugByName.mockResolvedValueOnce([]);
        fetchAnaloguesFromFDA.mockResolvedValue([]);
        findDailyMedDrug.mockResolvedValueOnce(null).mockResolvedValueOnce({
            source: 'DailyMed (NLM)',
            sourceUrl: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=verified'
        });
        resolveIngredientFromPubChem.mockResolvedValueOnce({
            activeIngredient: 'DIPHENHYDRAMINE',
            source: 'PubChem (NIH)',
            sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/8980'
        });
        const alias = {_id: 'alias-1', name: 'Dimedrol', activeIngredient: 'DIPHENHYDRAMINE'};
        upsertInternationalDrug.mockResolvedValueOnce(alias);

        await expect(getSimilarDrugs('Dimedrol')).resolves.toEqual([alias]);
        expect(upsertInternationalDrug).toHaveBeenCalledWith(expect.objectContaining({
            verificationSource: 'DailyMed (NLM)',
            verificationUrl: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=verified'
        }));
    });

    test('returns an empty result rather than failing when DailyMed is unavailable', async () => {
        getDrugByName.mockResolvedValueOnce([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([]);
        findDailyMedDrug.mockRejectedValueOnce(new ExternalServiceError('DailyMed unavailable'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        try {
            await expect(getSimilarDrugs('unknown-drug')).resolves.toEqual([]);
            expect(saveSearchResult).toHaveBeenCalledWith(
                'unknown-drug', [], DRUG_SEARCH_FALLBACK_CACHE_TTL_MS
            );
        } finally {
            consoleSpy.mockRestore();
        }
    });

    test('returns cached search results without calling FDA again', async () => {
        const localDrug = {_id: 'drug-1', name: 'Warfarin', activeIngredient: 'WARFARIN'};
        const analogue = {_id: 'drug-2', name: 'JANTOVEN', activeIngredient: 'WARFARIN'};
        getCachedDrugIds.mockResolvedValueOnce(['drug-1', 'drug-2']);
        getDrugsByIds.mockResolvedValueOnce([localDrug, analogue]);

        const results = await getSimilarDrugs(' WARFARIN ');

        expect(results.map((drug) => drug.name)).toEqual(['Warfarin', 'JANTOVEN']);
        expect(getCachedDrugIds).toHaveBeenCalledWith('warfarin');
        expect(getDrugsByIds).toHaveBeenCalledWith(['drug-1', 'drug-2'], {searchSummary: true});
        expect(getDrugByName).not.toHaveBeenCalled();
        expect(fetchAnaloguesFromFDA).not.toHaveBeenCalled();
        expect(createVector).not.toHaveBeenCalled();
        expect(saveSearchResult).not.toHaveBeenCalled();
    });

    test('collapses legacy duplicate names and prefers the FDA-labelled record', async () => {
        const bare = {_id: 'drug-1', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM', guidelines: {source: 'FDA'}};
        const labelled = {
            _id: 'drug-2', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM',
            guidelines: {source: 'FDA', contentHash: 'label-hash', sourceUrl: 'https://example.com/label'}
        };
        getDrugByName.mockResolvedValueOnce([bare, labelled, bare]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([]);

        await expect(getSimilarDrugs('warfarin')).resolves.toEqual([labelled]);
        expect(saveSearchResult).toHaveBeenCalledWith(
            'warfarin', [labelled], DRUG_SEARCH_FALLBACK_CACHE_TTL_MS
        );
        expect(fetchAnaloguesFromFDA).toHaveBeenCalledWith('warfarin');
    });

    test('deduplicates previously cached legacy IDs', async () => {
        const bare = {_id: 'drug-1', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM'};
        const labelled = {
            _id: 'drug-2', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM',
            guidelines: {contentHash: 'label-hash'}
        };
        getCachedDrugIds.mockResolvedValueOnce(['drug-1', 'drug-2']);
        getDrugsByIds.mockResolvedValueOnce([bare, labelled]);

        await expect(getSimilarDrugs('warfarin')).resolves.toEqual([labelled]);
        expect(getDrugByName).not.toHaveBeenCalled();
    });

    test('reuses an empty search result during a brief FDA outage', async () => {
        getCachedDrugIds.mockResolvedValueOnce([]);

        await expect(getSimilarDrugs('unknown')).resolves.toEqual([]);

        expect(getDrugByName).not.toHaveBeenCalled();
        expect(fetchAnaloguesFromFDA).not.toHaveBeenCalled();
    });

    test('finds tibolone without a hardcoded catalog when PubChem confirms its identity', async () => {
        getDrugByName.mockResolvedValueOnce([]);
        fetchAnaloguesFromFDA.mockResolvedValue([]);
        resolveIngredientFromPubChem.mockResolvedValueOnce({
            activeIngredient: 'tibolone',
            source: 'PubChem (NIH)',
            sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/444008'
        });
        upsertInternationalDrug.mockImplementationOnce(async (entry) => ({
            _id: 'tibolone-id',
            name: entry.name,
            activeIngredient: entry.activeIngredient,
            guidelines: {source: entry.source, sourceUrl: entry.sourceUrl}
        }));

        const result = await getSimilarDrugs('TIBOLONE');

        expect(result).toEqual([expect.objectContaining({
            name: 'TIBOLONE',
            activeIngredient: 'tibolone',
            guidelines: expect.objectContaining({source: 'PubChem (NIH)'})
        })]);
        expect(fetchAnaloguesFromFDA).toHaveBeenCalledWith('tibolone');
        expect(saveSearchResult).toHaveBeenCalledWith('tibolone', result);
    });

    test('finds Suprastin through the same general PubChem resolution', async () => {
        getDrugByName.mockResolvedValueOnce([]);
        fetchAnaloguesFromFDA.mockResolvedValue([]);
        resolveIngredientFromPubChem.mockResolvedValueOnce({
            activeIngredient: 'chloropyramine',
            source: 'PubChem (NIH)',
            sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/80311'
        });
        upsertInternationalDrug.mockImplementationOnce(async (entry) => ({
            _id: 'suprastin-id',
            name: entry.name,
            activeIngredient: entry.activeIngredient,
            guidelines: {source: entry.source, sourceUrl: entry.sourceUrl}
        }));

        const result = await getSimilarDrugs('suprastin');

        expect(result).toEqual([expect.objectContaining({
            name: 'suprastin',
            activeIngredient: 'chloropyramine',
            guidelines: expect.objectContaining({source: 'PubChem (NIH)'})
        })]);
        expect(fetchAnaloguesFromFDA).toHaveBeenCalledWith('chloropyramine');
    });

    test('refreshes a cached search when a referenced drug is missing', async () => {
        const localDrug = {_id: 'drug-1', name: 'Warfarin', activeIngredient: 'WARFARIN'};
        getDrugByName.mockResolvedValueOnce([localDrug]);
        getCachedDrugIds.mockResolvedValueOnce(['drug-1', 'drug-2']);
        getDrugsByIds.mockResolvedValueOnce([localDrug]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([]);

        await expect(getSimilarDrugs('warfarin')).resolves.toEqual([localDrug]);
        expect(fetchAnaloguesFromFDA).toHaveBeenCalledWith('warfarin');
    });

    test('excludes combination products while checking openFDA for analogues', async () => {
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

        const result = await getSimilarDrugs('amoxicillin');

        expect(result.map((drug) => drug.name)).toEqual(['Amoxicillin']);
        expect(fetchAnaloguesFromFDA).toHaveBeenCalledWith('amoxicillin');
        expect(findDailyMedDrug).not.toHaveBeenCalled();
    });

    test('returns distinct local products sharing the active ingredient', async () => {
        const warfarin = {_id: 'drug-1', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM'};
        const jantoven = {_id: 'drug-2', name: 'JANTOVEN', activeIngredient: 'WARFARIN SODIUM'};
        const combination = {_id: 'drug-3', name: 'WARFARIN AND OTHER', activeIngredient: 'WARFARIN; OTHER'};
        getDrugByName.mockResolvedValueOnce([warfarin, warfarin, jantoven, combination]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([]);

        const result = await getSimilarDrugs('warfarin');

        expect(result.map((drug) => drug.name)).toEqual(['WARFARIN SODIUM', 'JANTOVEN']);
        expect(saveSearchResult).toHaveBeenCalledWith(
            'warfarin', result, DRUG_SEARCH_FALLBACK_CACHE_TTL_MS
        );
    });

    test('merges local products with distinct FDA-labelled analogues', async () => {
        const warfarin = {_id: 'drug-1', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM'};
        const coumadin = {_id: 'drug-2', name: 'COUMADIN', activeIngredient: 'WARFARIN SODIUM'};
        getDrugByName.mockResolvedValueOnce([warfarin]).mockResolvedValueOnce([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce([
            {openfda: {brand_name: ['COUMADIN'], generic_name: ['WARFARIN SODIUM']}, warnings: ['label text']},
            {openfda: {brand_name: ['COUMADIN'], generic_name: ['WARFARIN SODIUM']}, warnings: ['label text']}
        ]);
        createVector.mockResolvedValueOnce([0.1]);
        createDrug.mockResolvedValueOnce(coumadin);

        const result = await getSimilarDrugs('warfarin');

        expect(result.map((drug) => drug.name)).toEqual(['WARFARIN SODIUM', 'COUMADIN']);
        expect(createDrug).toHaveBeenCalledTimes(1);
        expect(saveSearchResult).toHaveBeenCalledWith('warfarin', result);
    });

    test('saves at most twelve distinct FDA analogues', async () => {
        getDrugByName.mockResolvedValue([]);
        fetchAnaloguesFromFDA.mockResolvedValueOnce(Array.from({length: 13}, (_, index) => ({
            openfda: {
                brand_name: [`Brand ${index}`],
                generic_name: ['WARFARIN']
            },
            warnings: [`FDA warning ${index}`]
        })));
        createVector.mockResolvedValue([0.1]);
        createDrug.mockImplementation(async (drug) => ({...drug, _id: drug.name}));

        const result = await getSimilarDrugs('warfarin');

        expect(result).toHaveLength(12);
        expect(createDrug).toHaveBeenCalledTimes(12);
    });

    test('does not present combination products as an exact ingredient result', async () => {
        getDrugByName.mockResolvedValue([]);
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

        expect(result.map((drug) => drug.name)).toEqual(['METFORMIN HYDROCHLORIDE']);
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
        expect(saveSearchResult).toHaveBeenCalledWith('testdrug', [{name: 'TestDrug'}]);
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
