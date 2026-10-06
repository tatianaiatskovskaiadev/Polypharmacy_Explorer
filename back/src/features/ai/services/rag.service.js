import {answerFromEvidence, createVector} from './ai.service.js';
import * as passageRepository from '../../drugs/repository/fda-passage.repository.js';
import {RAG_PROMPT_VERSION} from '../../../utils/constants.js';
import {recordPromptVersion, recordResult, recordRetrieval} from '../eval/metrics.js';

const INSUFFICIENT_EVIDENCE = 'The indexed FDA label excerpts do not provide enough evidence to answer this question.';

export const answerQuestion = async (question, drugIds, dependencies = {
    createVector,
    searchPassages: passageRepository.searchPassages,
    answerFromEvidence
}) => {
    recordPromptVersion(RAG_PROMPT_VERSION);
    const vector = await dependencies.createVector(question);
    const passages = await dependencies.searchPassages(vector, drugIds);
    recordRetrieval(passages);
    if (passages.length === 0) {
        const result = {answer: INSUFFICIENT_EVIDENCE, sources: [], promptVersion: RAG_PROMPT_VERSION};
        recordResult(result, true);
        return result;
    }

    const draft = await dependencies.answerFromEvidence(question, passages);
    const citedIndices = [...draft.matchAll(/\[(\d+)\]/g)]
        .map((match) => Number(match[1]) - 1);
    if (citedIndices.length === 0 || citedIndices.some((index) => index < 0 || index >= passages.length)) {
        const result = {answer: INSUFFICIENT_EVIDENCE, sources: [], promptVersion: RAG_PROMPT_VERSION};
        recordResult(result, false);
        return result;
    }

    const sources = [...new Set(citedIndices)].map((index) => ({
        number: index + 1,
        drugName: passages[index].drugName,
        section: passages[index].section,
        text: passages[index].text,
        sourceUrl: passages[index].sourceUrl,
        score: passages[index].score
    }));
    const result = {answer: draft, sources, promptVersion: RAG_PROMPT_VERSION};
    recordResult(result, true);
    return result;
};
