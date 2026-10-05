import {randomUUID} from 'node:crypto';
import {askAgent} from '../services/agent.service.js';
import {getTraceMetrics, recordRetrieval, runWithTrace, scoreCase} from './metrics.js';

export const evaluateAgentCase = (testCase) => runWithTrace(randomUUID(), async () => {
    const sources = [];
    let turnIndex = 0;
    const result = await askAgent(testCase.question, testCase.drugIds, {
        completeAgentTurn: async () => testCase.turns[turnIndex++],
        createAgentTools: () => ({
            sources,
            execute: async (name) => {
                if (name !== 'search_fda_passages') return {error: 'Unexpected tool'};
                recordRetrieval(testCase.passages);
                sources.push(...testCase.passages.map((passage, index) => ({
                    ...passage,
                    number: index + 1
                })));
                return {passages: sources.map(({number, drugName, section, text}) => ({
                    number, drugName, section, text
                }))};
            }
        })
    });
    const trace = getTraceMetrics();
    return {id: testCase.id, ...scoreCase(result, testCase.expected, trace), trace};
});
