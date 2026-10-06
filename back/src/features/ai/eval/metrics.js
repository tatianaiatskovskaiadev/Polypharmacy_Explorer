import {AsyncLocalStorage} from 'node:async_hooks';

const traces = new AsyncLocalStorage();
const USD_PER_MILLION_TOKENS = {
    'gpt-4o-mini': {input: 0.15, cachedInput: 0.075, output: 0.60},
    'text-embedding-3-small': {input: 0.02, cachedInput: 0.02, output: 0}
};

export const runWithTrace = (traceId, operation) => traces.run({
    traceId,
    startedAt: performance.now(),
    timeToFirstEventMs: null,
    timeToFirstTokenMs: null,
    models: new Set(),
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
    usageComplete: true,
    retrieval: {documentsRetrieved: 0, retrievalScores: []},
    agent: {toolCalls: [], toolLatency: []},
    result: {citationCount: 0, insufficientEvidence: null, validationPassed: null}
}, operation);

export const currentTrace = () => traces.getStore();

export const recordModelUsage = (response, requestedModel) => {
    const trace = currentTrace();
    if (!trace) return;
    const model = response?.model ?? requestedModel;
    trace.models.add(model);
    const usage = response?.usage;
    const inputTokens = usage?.prompt_tokens ?? usage?.total_tokens;
    const outputTokens = requestedModel === 'text-embedding-3-small' ? 0 : usage?.completion_tokens;
    const prices = model === requestedModel || model.startsWith(`${requestedModel}-`)
        ? USD_PER_MILLION_TOKENS[requestedModel]
        : undefined;
    if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens) || !prices) {
        trace.usageComplete = false;
        return;
    }
    const cachedTokens = Math.min(inputTokens, usage?.prompt_tokens_details?.cached_tokens ?? 0);
    trace.inputTokens += inputTokens;
    trace.outputTokens += outputTokens;
    trace.estimatedCost += (
        (inputTokens - cachedTokens) * prices.input +
        cachedTokens * prices.cachedInput +
        outputTokens * prices.output
    ) / 1_000_000;
};

export const recordRetrieval = (passages) => {
    const trace = currentTrace();
    if (!trace) return;
    trace.retrieval.documentsRetrieved += passages.length;
    trace.retrieval.retrievalScores.push(...passages.map(({score}) => score ?? null));
};

export const recordToolCall = (name, status, latencyMs) => {
    const trace = currentTrace();
    if (!trace) return;
    trace.agent.toolCalls.push({name, status});
    trace.agent.toolLatency.push({name, latencyMs});
};

export const recordResult = (result, validationPassed) => {
    const trace = currentTrace();
    if (!trace) return;
    trace.result = {
        citationCount: result.sources.length,
        insufficientEvidence: result.sources.length === 0,
        validationPassed
    };
};

export const recordValidation = (passed) => {
    const trace = currentTrace();
    if (trace) trace.result.validationPassed = passed;
};

export const getTraceMetrics = (trace = currentTrace()) => {
    if (!trace) return null;
    return {
        traceId: trace.traceId,
        model: [...trace.models],
        promptVersion: trace.promptVersion ?? null,
        latencyMs: Math.round(performance.now() - trace.startedAt),
        timeToFirstEventMs: trace.timeToFirstEventMs,
        timeToFirstTokenMs: trace.timeToFirstTokenMs,
        inputTokens: trace.usageComplete ? trace.inputTokens : null,
        outputTokens: trace.usageComplete ? trace.outputTokens : null,
        estimatedCost: trace.usageComplete ? Number(trace.estimatedCost.toFixed(8)) : null,
        retrieval: trace.retrieval,
        agent: trace.agent,
        result: trace.result
    };
};

export const recordPromptVersion = (version) => {
    const trace = currentTrace();
    if (trace) trace.promptVersion = version;
};

export const recordStreamEvent = (event) => {
    const trace = currentTrace();
    if (!trace) return;
    trace.timeToFirstEventMs ??= Math.round(performance.now() - trace.startedAt);
    if (event === 'answer.delta') {
        trace.timeToFirstTokenMs ??= Math.round(performance.now() - trace.startedAt);
    }
};

export const scoreCase = (result, expected, trace) => {
    const checks = {
        citationCount: result.sources.length === expected.citationCount,
        insufficientEvidence: (result.sources.length === 0) === expected.insufficientEvidence,
        validationPassed: trace.result.validationPassed === expected.validationPassed,
        sourceUrls: (expected.sourceUrls ?? []).every((url) => result.sources.some((source) => source.sourceUrl === url)),
        toolNames: (expected.toolNames ?? []).every((name) => result.toolCalls?.some((call) => call.name === name && call.status === 'ok'))
    };
    return {passed: Object.values(checks).every(Boolean), checks};
};
