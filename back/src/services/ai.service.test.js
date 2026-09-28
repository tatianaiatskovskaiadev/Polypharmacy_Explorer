import {beforeEach, describe, expect, jest, test} from '@jest/globals';
const embeddingsCreate = jest.fn();
const chatCompletionsCreate = jest.fn();

jest.unstable_mockModule('openai', () => ({
    default: jest.fn().mockImplementation(() => ({
        embeddings: {
            create: embeddingsCreate
        },
        chat: {
            completions: {
                create: chatCompletionsCreate
            }
        }
    }))
}));

const {createVector, normalizeInteractionText} = await import('./ai.service.js');

describe('ai service', () => {
    beforeEach(() => {
        embeddingsCreate.mockReset();
        chatCompletionsCreate.mockReset();
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

    test('maps OpenAI embedding failures to ExternalServiceError', async () => {
        embeddingsCreate.mockRejectedValueOnce(new Error('rate limit'));

        await expect(createVector('aspirin')).rejects.toMatchObject({
            name: 'ExternalServiceError',
            statusCode: 502,
            message: 'OpenAI request failed: rate limit'
        });
    });

    test('maps OpenAI chat completion failures to ExternalServiceError', async () => {
        chatCompletionsCreate.mockRejectedValueOnce(new Error('network timeout'));

        await expect(normalizeInteractionText('FDA interaction text')).rejects.toMatchObject({
            name: 'ExternalServiceError',
            statusCode: 502,
            message: 'OpenAI request failed: network timeout'
        });
    });
});
