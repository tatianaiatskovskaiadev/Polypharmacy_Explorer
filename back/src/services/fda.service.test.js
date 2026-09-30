import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const fetchMock = jest.fn();
global.fetch = fetchMock;

const {fetchRawInteraction} = await import('./fda.service.js');

const createResponse = (body, status = 200) => ({
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 200 ? 'OK' : 'Error',
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body))
});

describe('fda service', () => {
    beforeEach(() => {
        fetchMock.mockReset();
    });

    test('finds directional interaction from a drug label using simplified interacting term', async () => {
        fetchMock
            .mockResolvedValueOnce(createResponse({error: {message: 'Not found'}}, 404))
            .mockResolvedValueOnce(createResponse({
                results: [
                    {
                        drug_interactions: [
                            'Amiodarone increases warfarin exposure and requires INR monitoring.'
                        ]
                    }
                ]
            }));

        await expect(fetchRawInteraction('AMIODARONE HYDROCHLORIDE', 'WARFARIN SODIUM'))
            .resolves
            .toContain('warfarin');

        const requestedUrls = fetchMock.mock.calls.map(([url]) => decodeURIComponent(url));
        expect(requestedUrls[0]).toContain('drug_interactions:"WARFARIN SODIUM"');
        expect(requestedUrls[1]).toContain('drug_interactions:"WARFARIN"');
    });
});
