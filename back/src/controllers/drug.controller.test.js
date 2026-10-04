import {expect, jest, test} from '@jest/globals';

const getSimilarDrugs = jest.fn();
jest.unstable_mockModule('../services/drug.service.js', () => ({
    getSimilarDrugs,
    createDrug: jest.fn(),
    searchDrugsBySymptom: jest.fn()
}));

const {getSimilarDrugs: handleSearch} = await import('./drug.controller.js');

test('returns compact search results without full FDA label text', async () => {
    getSimilarDrugs.mockResolvedValueOnce([{
        _id: 'drug-1', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM',
        guidelines: {source: 'FDA', sourceUrl: 'https://example.com/label', originalText: 'long label', contentHash: 'hash'},
        createdAt: new Date(), __v: 0
    }]);
    const response = {status: jest.fn().mockReturnThis(), json: jest.fn()};

    await handleSearch({body: {text: 'warfarin'}}, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith([{
        _id: 'drug-1', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM',
        guidelines: {source: 'FDA', sourceUrl: 'https://example.com/label', verificationSource: undefined, verificationUrl: undefined}
    }]);
});

test('does not claim FDA provenance when the source is missing', async () => {
    getSimilarDrugs.mockResolvedValueOnce([{
        _id: 'drug-2', name: 'Unknown drug', activeIngredient: 'unknown'
    }]);
    const response = {status: jest.fn().mockReturnThis(), json: jest.fn()};

    await handleSearch({body: {text: 'unknown'}}, response);

    expect(response.json).toHaveBeenCalledWith([expect.objectContaining({
        guidelines: expect.objectContaining({source: 'Unknown'})
    })]);
});
