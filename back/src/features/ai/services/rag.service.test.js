import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const createVector = jest.fn();
const answerFromEvidence = jest.fn();
const searchPassages = jest.fn();

jest.unstable_mockModule('./ai.service.js', () => ({createVector, answerFromEvidence}));
jest.unstable_mockModule('../../drugs/repository/fda-passage.repository.js', () => ({searchPassages}));

const {answerQuestion} = await import('./rag.service.js');

describe('RAG answer', () => {
    beforeEach(() => {
        createVector.mockReset();
        answerFromEvidence.mockReset();
        searchPassages.mockReset();
        createVector.mockResolvedValue([0.1, 0.2]);
    });

    test('returns insufficient evidence without calling the LLM when retrieval is empty', async () => {
        searchPassages.mockResolvedValueOnce([]);
        const result = await answerQuestion('What is the interaction?', ['drug-1']);
        expect(result.sources).toEqual([]);
        expect(result.answer).toContain('do not provide enough evidence');
        expect(answerFromEvidence).not.toHaveBeenCalled();
    });

    test('returns only cited passages with source metadata', async () => {
        searchPassages.mockResolvedValueOnce([
            {drugName: 'Drug A', section: 'drug_interactions', text: 'Relevant text', sourceUrl: 'https://example.com/a', score: 0.9},
            {drugName: 'Drug B', section: 'warnings', text: 'Other text', sourceUrl: 'https://example.com/b', score: 0.8}
        ]);
        answerFromEvidence.mockResolvedValueOnce('The label reports a risk [1].');
        const result = await answerQuestion('What is the risk?', ['drug-1', 'drug-2']);
        expect(searchPassages).toHaveBeenCalledWith([0.1, 0.2], ['drug-1', 'drug-2']);
        expect(result.sources).toEqual([expect.objectContaining({number: 1, text: 'Relevant text'})]);
    });

    test('rejects references outside the retrieved evidence', async () => {
        searchPassages.mockResolvedValueOnce([
            {drugName: 'Drug A', section: 'warnings', text: 'Relevant text'}
        ]);
        answerFromEvidence.mockResolvedValueOnce('Unsupported citation [2].');
        const result = await answerQuestion('What is the risk?', ['drug-1']);
        expect(result.sources).toEqual([]);
        expect(result.answer).toContain('do not provide enough evidence');
    });
});
