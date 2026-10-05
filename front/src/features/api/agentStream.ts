import type {AgentAnswerResponse, RagAnswerRequest, RagSource} from '../../utils/types';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type AgentStreamEvent =
    | {event: 'agent.started'; data: Record<string, never>}
    | {event: 'tool.started'; data: {tool: string; callId: string}}
    | {event: 'tool.completed'; data: {tool: string; callId: string; durationMs: number; status: 'ok' | 'error'}}
    | {event: 'retrieval.completed'; data: {sourceCount: number}}
    | {event: 'generation.started'; data: Record<string, never>}
    | {event: 'answer.delta'; data: {text: string}}
    | {event: 'sources'; data: {sources: RagSource[]}}
    | {event: 'agent.completed'; data: {traceId: string; promptVersion: string; result: AgentAnswerResponse}}
    | {event: 'error'; data: {code: string; message: string; traceId: string}};

export class AgentStreamError extends Error {
    status?: number;
    code?: string;

    constructor(message: string, status?: number, code?: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export const streamAgentAnswer = async (
    body: RagAnswerRequest,
    csrfToken: string,
    onEvent: (event: AgentStreamEvent) => void,
    signal: AbortSignal
): Promise<AgentAnswerResponse> => {
    const response = await fetch(`${API_BASE_URL}/agent/ask/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'x-csrf-token': csrfToken
        },
        body: JSON.stringify(body),
        signal
    });
    if (!response.ok) throw new AgentStreamError('Unable to start the agent stream.', response.status);
    if (!response.body) throw new AgentStreamError('Streaming is unavailable in this browser.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: AgentAnswerResponse | null = null;
    const processFrame = (frame: string) => {
        let eventName = '';
        const dataLines: string[] = [];
        for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (!eventName || dataLines.length === 0) return;
        const event = {event: eventName, data: JSON.parse(dataLines.join('\n'))} as AgentStreamEvent;
        if (event.event === 'error') throw new AgentStreamError(event.data.message, undefined, event.data.code);
        onEvent(event);
        if (event.event === 'agent.completed') result = event.data.result;
    };

    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            buffer = (buffer + decoder.decode(value, {stream: true})).replaceAll('\r\n', '\n');
            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
                processFrame(buffer.slice(0, boundary));
                buffer = buffer.slice(boundary + 2);
                boundary = buffer.indexOf('\n\n');
            }
        }
        buffer += decoder.decode();
        if (buffer.trim()) processFrame(buffer);
    } finally {
        reader.releaseLock();
    }
    if (!result) throw new AgentStreamError('The agent stream ended before completion.', undefined, 'DISCONNECTED');
    return result;
};
