import {describe, expect, test} from '@jest/globals';
import {
    getTraceMetrics,
    recordModelUsage,
    recordPromptVersion,
    recordResult,
    recordRetrieval,
    recordStreamEvent,
    recordToolCall,
    runWithTrace
} from './metrics.js';

describe('AI trace metrics', () => {
    test('aggregates actual token usage, cached-token pricing, retrieval and tool timing', () => {
        const trace = runWithTrace('trace-1', () => {
            recordPromptVersion('rag-answer-v1');
            recordModelUsage({
                model: 'gpt-4o-mini-2024-07-18',
                usage: {prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: {cached_tokens: 20}}
            }, 'gpt-4o-mini');
            recordModelUsage({usage: {prompt_tokens: 100}}, 'text-embedding-3-small');
            recordRetrieval([{score: 0.9}, {score: 0.7}]);
            recordToolCall('search_fda_passages', 'ok', 12);
            recordResult({sources: [{number: 1}]}, true);
            return getTraceMetrics();
        });

        expect(trace).toEqual(expect.objectContaining({
            traceId: 'trace-1',
            model: ['gpt-4o-mini-2024-07-18', 'text-embedding-3-small'],
            promptVersion: 'rag-answer-v1',
            latencyMs: expect.any(Number),
            inputTokens: 200,
            outputTokens: 50,
            estimatedCost: 0.0000455,
            retrieval: {documentsRetrieved: 2, retrievalScores: [0.9, 0.7]},
            agent: {toolCalls: [{name: 'search_fda_passages', status: 'ok'}], toolLatency: [{name: 'search_fda_passages', latencyMs: 12}]},
            result: {citationCount: 1, insufficientEvidence: false, validationPassed: true}
        }));
    });

    test('does not invent token counts or cost when provider usage is missing', () => {
        const trace = runWithTrace('trace-2', () => {
            recordModelUsage({model: 'gpt-4o-mini'}, 'gpt-4o-mini');
            return getTraceMetrics();
        });
        expect(trace.inputTokens).toBeNull();
        expect(trace.outputTokens).toBeNull();
        expect(trace.estimatedCost).toBeNull();
    });

    test('keeps concurrent traces separate', async () => {
        const traces = await Promise.all([
            runWithTrace('first', async () => {
                await Promise.resolve();
                recordRetrieval([{score: 0.9}]);
                return getTraceMetrics();
            }),
            runWithTrace('second', async () => {
                await Promise.resolve();
                return getTraceMetrics();
            })
        ]);
        expect(traces.map(({traceId, retrieval}) => [traceId, retrieval.documentsRetrieved])).toEqual([
            ['first', 1], ['second', 0]
        ]);
    });

    test('measures first SSE event and first validated answer chunk', () => {
        const trace = runWithTrace('stream-trace', () => {
            recordStreamEvent('agent.started');
            recordStreamEvent('answer.delta');
            return getTraceMetrics();
        });
        expect(trace.timeToFirstEventMs).toEqual(expect.any(Number));
        expect(trace.timeToFirstTokenMs).toEqual(expect.any(Number));
        expect(trace.timeToFirstTokenMs).toBeGreaterThanOrEqual(trace.timeToFirstEventMs);
    });
});
