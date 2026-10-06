import {askAgent, executeAgent} from '../services/agent.service.js';
import {recordStreamEvent} from '../eval/metrics.js';
import {logEvent} from '../../../utils/logging.js';
import {ExternalServiceError} from '../../../utils/errors.js';

export const askSelectedDrugAgent = async (req, res) => {
    const {question, drugIds} = req.body;
    return res.status(200).json(await askAgent(question, drugIds));
};

export const streamSelectedDrugAgent = async (req, res) => {
    const controller = new AbortController();
    res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.on('close', () => {
        if (!res.writableEnded) controller.abort();
    });
    res.flushHeaders();
    const heartbeat = setInterval(() => {
        if (!res.destroyed) res.write(': keep-alive\n\n');
    }, 15_000);

    try {
        const {question, drugIds} = req.body;
        await executeAgent(question, drugIds, {
            signal: controller.signal,
            onEvent: (event, data) => {
                recordStreamEvent(event);
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            }
        });
        res.end();
    } catch (error) {
        if (!controller.signal.aborted && !res.destroyed) {
            logEvent('error', 'agent_stream_error', {requestId: req.requestId, errorType: error.name});
            const external = error instanceof ExternalServiceError;
            const data = {
                code: external ? 'EXTERNAL_SERVICE_ERROR' : 'INTERNAL_ERROR',
                message: external ? 'External AI service unavailable' : 'Unable to complete agent response',
                traceId: req.requestId
            };
            recordStreamEvent('error');
            res.write(`event: error\ndata: ${JSON.stringify(data)}\n\n`);
            res.end();
        }
    } finally {
        clearInterval(heartbeat);
    }
};
