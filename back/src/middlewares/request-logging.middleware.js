import {randomUUID} from 'crypto';
import {getTraceMetrics, runWithTrace} from '../eval/metrics.js';

export const logEvent = (level, event, fields = {}) => {
    const entry = {timestamp: new Date().toISOString(), level, event, ...fields};
    console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
};

export const requestLogging = (req, res, next) => {
    const startedAt = performance.now();
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    runWithTrace(req.requestId, () => {
        res.on('finish', () => {
            logEvent('info', 'request_complete', {
                requestId: req.requestId,
                method: req.method,
                status: res.statusCode,
                durationMs: Math.round(performance.now() - startedAt)
            });
            const metrics = getTraceMetrics();
            if (metrics.model.length || req.path === '/rag/answer' || req.path === '/agent/ask') {
                logEvent('info', 'ai_request_complete', metrics);
            }
        });
        next();
    });
};
