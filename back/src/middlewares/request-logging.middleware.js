import {randomUUID} from 'crypto';
import {currentTrace, getTraceMetrics, runWithTrace} from '../features/ai/eval/metrics.js';
import {logEvent} from '../utils/logging.js';

export const requestLogging = (req, res, next) => {
    const startedAt = performance.now();
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    runWithTrace(req.requestId, () => {
        const trace = currentTrace();
        let logged = false;
        const complete = (aborted) => {
            if (logged) return;
            logged = true;
            logEvent('info', 'request_complete', {
                requestId: req.requestId,
                method: req.method,
                status: res.statusCode,
                durationMs: Math.round(performance.now() - startedAt),
                aborted
            });
            const metrics = getTraceMetrics(trace);
            if (metrics.model.length || req.path === '/rag/answer' || req.path === '/agent/ask' ||
                req.path === '/agent/ask/stream') {
                logEvent('info', 'ai_request_complete', metrics);
            }
        };
        res.on('finish', () => complete(false));
        res.on('close', () => complete(!res.writableEnded));
        next();
    });
};
