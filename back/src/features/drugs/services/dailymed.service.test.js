import {afterEach, describe, expect, jest, test} from '@jest/globals';
import {extractInteractionSection, fetchInteractionFromDailyMed, findDailyMedDrug} from './dailymed.service.js';

const originalFetch = global.fetch;
const setid = '654ca5d2-d4c1-48f8-90c4-130a21162bb0';

afterEach(() => {
    global.fetch = originalFetch;
});

describe('DailyMed fallback', () => {
    test('extracts only the drug interaction section', () => {
        const xml = `<section><code code="34073-7"/><excerpt><text>Summary only</text></excerpt><text><paragraph>Warfarin interacts with fluconazole.</paragraph></text></section>`;
        expect(extractInteractionSection(xml)).toBe('Warfarin interacts with fluconazole.');
        expect(extractInteractionSection('<section><text>Other warnings</text></section>')).toBeNull();
    });

    test('stores only a matching generic label with its source URL', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({data: [{title: 'WARFARIN SODIUM TABLET', setid}]})
        });
        await expect(findDailyMedDrug('warfarin')).resolves.toEqual({
            name: 'warfarin',
            activeIngredient: 'warfarin',
            source: 'DailyMed (NLM)',
            sourceUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`
        });
    });

    test('resolves a brand name from an exact DailyMed label title', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ok: true, json: async () => ({data: []})})
            .mockResolvedValueOnce({ok: true, json: async () => ({data: [{
                title: 'BENADRYL (DIPHENHYDRAMINE HYDROCHLORIDE) TABLET [KENVUE]',
                setid
            }]})});

        await expect(findDailyMedDrug('Benadryl')).resolves.toEqual({
            name: 'Benadryl',
            activeIngredient: 'DIPHENHYDRAMINE HYDROCHLORIDE',
            source: 'DailyMed (NLM)',
            sourceUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`
        });
    });

    test('requires explicit mention of the second ingredient before returning pair evidence', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ok: true, json: async () => ({data: [{setid}]})})
            .mockResolvedValueOnce({
                ok: true,
                text: async () => '<section><code code="34073-7"/><text>Fluconazole increases warfarin exposure.</text></section>'
            });

        await expect(fetchInteractionFromDailyMed('fluconazole', 'warfarin')).resolves.toEqual({
            text: 'Fluconazole increases warfarin exposure.',
            source: 'DailyMed (NLM)',
            sourceUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`
        });
    });
});
