import {answerFromEvidence, createVector} from './ai.service.js';
import * as passageRepository from '../repository/fda-passage.repository.js';
import {RAG_PROMPT_VERSION} from '../utils/constants.js';

const INSUFFICIENT_EVIDENCE = 'The indexed FDA label excerpts do not provide enough evidence to answer this question.';

export const answerQuestion = async (question, drugIds) => {
    const vector = await createVector(question);
    const passages = await passageRepository.searchPassages(vector, drugIds);
    if (passages.length === 0) {
        return {answer: INSUFFICIENT_EVIDENCE, sources: [], promptVersion: RAG_PROMPT_VERSION};
    }

    const draft = await answerFromEvidence(question, passages);
    const citedIndices = [...draft.matchAll(/\[(\d+)\]/g)]
        .map((match) => Number(match[1]) - 1);
    if (citedIndices.length === 0 || citedIndices.some((index) => index < 0 || index >= passages.length)) {
        return {answer: INSUFFICIENT_EVIDENCE, sources: [], promptVersion: RAG_PROMPT_VERSION};
    }

    const sources = [...new Set(citedIndices)].map((index) => ({
        number: index + 1,
        drugName: passages[index].drugName,
        section: passages[index].section,
        text: passages[index].text,
        sourceUrl: passages[index].sourceUrl,
        score: passages[index].score
    }));
    return {answer: draft, sources, promptVersion: RAG_PROMPT_VERSION};
};
