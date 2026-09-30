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

    test('sends explicit risk rubric to reduce default major classification', async () => {
        chatCompletionsCreate.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            riskLevel: 'moderate',
                            description: 'Monitor for additive adverse effects.',
                            actionRequired: 'Monitor the patient and adjust therapy if clinically indicated.'
                        })
                    }
                }
            ]
        });

        await normalizeInteractionText('FDA text says monitor the patient.', {
            drugNameA: 'AMIODARONE HYDROCHLORIDE',
            drugNameB: 'SIMVASTATIN'
        });

        const systemPrompt = chatCompletionsCreate.mock.calls[0][0].messages[0].content;
        expect(systemPrompt).toContain('Analyze ONLY the interaction between "AMIODARONE HYDROCHLORIDE" and "SIMVASTATIN"');
        expect(systemPrompt).toContain('Use this risk rubric');
        expect(systemPrompt).toContain('Do NOT classify as "major" only because the text mentions monitoring');
        expect(systemPrompt).toContain('maximum coadministered dose');
    });
});
