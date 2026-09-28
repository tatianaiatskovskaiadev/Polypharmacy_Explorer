import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const embeddingsCreate = jest.fn();

jest.unstable_mockModule('openai', () => ({
    default: jest.fn().mockImplementation(() => ({
        embeddings: {
            create: embeddingsCreate
        }
    }))
}));

const {createVector} = await import('./ai.service.js');

describe('ai service', () => {
    beforeEach(() => {
        embeddingsCreate.mockReset();
    });

    test('truncates oversized embedding input before calling OpenAI', async () => {
        embeddingsCreate.mockResolvedValueOnce({
            data: [{embedding: [0.1, 0.2]}]
        });

        await expect(createVector('x'.repeat(20_000))).resolves.toEqual([0.1, 0.2]);

        expect(embeddingsCreate).toHaveBeenCalledWith(expect.objectContaining({
            input: expect.any(String)
        }));
        expect(embeddingsCreate.mock.calls[0][0].input.length).toBe(8_000);
    });
});
