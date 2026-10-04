import {afterEach, expect, jest, test} from '@jest/globals';
import {resolveIngredientFromPubChem} from './ingredient-resolution.service.js';

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
});

test('resolves an exact PubChem synonym with a traceable compound URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({InformationList: {Information: [{
            CID: 8980,
            Synonym: ['DIPHENHYDRAMINE HYDROCHLORIDE', 'Dimedrol']
        }]}})
    });

    await expect(resolveIngredientFromPubChem('Dimedrol')).resolves.toEqual({
        activeIngredient: 'DIPHENHYDRAMINE',
        source: 'PubChem (NIH)',
        sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/8980'
    });
});

test('rejects fuzzy chemical matches that lack the requested exact synonym', async () => {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({InformationList: {Information: [{
            CID: 8980,
            Synonym: ['DIPHENHYDRAMINE HYDROCHLORIDE', 'Dimedrol hydrochloride']
        }]}})
    });

    await expect(resolveIngredientFromPubChem('Dimedrol')).resolves.toBeNull();
});

test('accepts an exact generic chemical name even when it is already canonical', async () => {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({InformationList: {Information: [{
            CID: 444008,
            Synonym: ['tibolone', 'Liviella']
        }]}})
    });

    await expect(resolveIngredientFromPubChem('tibolone')).resolves.toEqual({
        activeIngredient: 'tibolone',
        source: 'PubChem (NIH)',
        sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/444008'
    });
});
