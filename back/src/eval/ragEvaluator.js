import {randomUUID} from 'node:crypto';
import {answerQuestion} from '../services/rag.service.js';
import {getTraceMetrics, runWithTrace, scoreCase} from './metrics.js';

export const evaluateRagCase = (testCase) => runWithTrace(randomUUID(), async () => {
    const result = await answerQuestion(testCase.question, testCase.drugIds, {
        createVector: async () => [0.1],
        searchPassages: async () => testCase.passages,
        answerFromEvidence: async () => testCase.draft
    });
    const trace = getTraceMetrics();
    return {id: testCase.id, ...scoreCase(result, testCase.expected, trace), trace};
});
