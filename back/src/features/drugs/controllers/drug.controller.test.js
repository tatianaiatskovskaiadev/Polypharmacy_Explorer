import {expect, jest, test} from '@jest/globals';

const getSimilarDrugsWithStatus = jest.fn();
jest.unstable_mockModule('../services/drug.service.js', () => ({
    getSimilarDrugsWithStatus,
    createDrug: jest.fn(),
    searchDrugsBySymptom: jest.fn()
}));

const {getSimilarDrugs: handleSearch} = await import('./drug.controller.js');
const {Drug} = await import('../models/Drug.model.js');

test('returns compact search results without full FDA label text', async () => {
    getSimilarDrugsWithStatus.mockResolvedValueOnce({drugs: [{
        _id: 'drug-1', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM',
        guidelines: {source: 'FDA', sourceUrl: 'https://example.com/label', originalText: 'long label', contentHash: 'hash'},
        createdAt: new Date(), __v: 0
    }], partial: false});
    const response = {status: jest.fn().mockReturnThis(), json: jest.fn()};

    await handleSearch({body: {text: 'warfarin'}}, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith([{
        _id: 'drug-1', name: 'WARFARIN SODIUM', activeIngredient: 'WARFARIN SODIUM',
        guidelines: {source: 'FDA', sourceUrl: 'https://example.com/label', verificationSource: undefined, verificationUrl: undefined}
    }]);
});

test('does not claim FDA provenance when the source is missing', async () => {
    getSimilarDrugsWithStatus.mockResolvedValueOnce({drugs: [
        new Drug({name: 'Unknown drug', activeIngredient: 'unknown'})
    ], partial: false});
    const response = {status: jest.fn().mockReturnThis(), json: jest.fn()};

    await handleSearch({body: {text: 'unknown'}}, response);

    expect(response.json).toHaveBeenCalledWith([expect.objectContaining({
        guidelines: expect.objectContaining({source: 'Unknown'})
    })]);
});

test('marks incomplete search results without changing the response body', async () => {
    const drug = {_id: 'drug-1', name: 'Aspirin', activeIngredient: 'aspirin'};
    getSimilarDrugsWithStatus.mockResolvedValueOnce({drugs: [drug], partial: true});
    const response = {status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn()};

    await handleSearch({body: {text: 'aspirin'}}, response);

    expect(response.set).toHaveBeenCalledWith('X-Search-Partial', 'true');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith([expect.objectContaining({name: 'Aspirin'})]);
});
