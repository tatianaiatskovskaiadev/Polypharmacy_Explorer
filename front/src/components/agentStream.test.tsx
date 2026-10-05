import {afterEach, expect, test, vi} from 'vitest';
import {AgentStreamError, streamAgentAnswer} from '../features/api/agentStream.ts';

const encoder = new TextEncoder();
const request = {question: 'What do the labels say?', drugIds: ['drug-1']};

afterEach(() => vi.unstubAllGlobals());

test('parses fragmented SSE frames and returns the completed result', async () => {
    const result = {answer: 'Grounded [1].', sources: [], toolCalls: [], promptVersion: 'agent-tools-v1'};
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encoder.encode('event: agent.started\r'));
            controller.enqueue(encoder.encode('\ndata: {}\r\n\r\nevent: answer.delta\ndata: {"text":"Grounded [1]."}\n\n'));
            controller.enqueue(encoder.encode(`event: agent.completed\ndata: ${JSON.stringify({traceId: 'trace-1', promptVersion: 'agent-tools-v1', result})}\n\n`));
            controller.close();
        }
    });
    const fetchMock = vi.fn(async () => new Response(stream, {headers: {'Content-Type': 'text/event-stream'}}));
    vi.stubGlobal('fetch', fetchMock);
    const events: string[] = [];

    await expect(streamAgentAnswer(request, 'csrf-token', (event) => events.push(event.event), new AbortController().signal))
        .resolves.toEqual(result);
    expect(events).toEqual(['agent.started', 'answer.delta', 'agent.completed']);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/agent/ask/stream'), expect.objectContaining({
        method: 'POST', credentials: 'include',
        headers: expect.objectContaining({'x-csrf-token': 'csrf-token'})
    }));
});

test('reports an SSE error and a stream that ends without completion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('event: error\ndata: {"code":"INTERNAL_ERROR","message":"Agent failed","traceId":"trace-1"}\n\n')));
    await expect(streamAgentAnswer(request, 'csrf-token', () => {}, new AbortController().signal))
        .rejects.toThrow('Agent failed');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('event: agent.started\ndata: {}\n\n')));
    await expect(streamAgentAnswer(request, 'csrf-token', () => {}, new AbortController().signal))
        .rejects.toThrow('ended before completion');
});

test('preserves HTTP authorization failures for the caller', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {status: 401})));
    await expect(streamAgentAnswer(request, 'csrf-token', () => {}, new AbortController().signal))
        .rejects.toMatchObject({status: 401, name: 'Error'} satisfies Partial<AgentStreamError>);
});
