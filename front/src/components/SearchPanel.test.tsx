import {afterEach, expect, test, vi} from 'vitest';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Provider} from 'react-redux';
import {store} from '../app/store.ts';
import {drugApi} from '../features/api/drugApi.ts';
import type {Drug} from '../utils/types';
import SearchPanel from './SearchPanel.tsx';
import {clearSession, setSession} from '../features/auth/authSlice.ts';

vi.mock('./GraphView.tsx', () => ({
    default: ({data}: {data: Drug[]}) => <div data-testid="graph-drugs">{data.map((drug) => drug.name).join(',')}</div>
}));

const drug: Drug = {
    _id: 'drug-1', name: 'Aspirin', activeIngredient: 'acetylsalicylic acid',
    guidelines: {source: 'FDA'}
};

afterEach(() => {
    cleanup();
    store.dispatch(drugApi.util.resetApiState());
    store.dispatch(clearSession());
    vi.unstubAllGlobals();
});

test('shows agent progress and progressively displays the completed SSE answer', async () => {
    store.dispatch(setSession({user: {id: 'user-1', email: 'user@example.org', emailVerified: true}, csrfToken: 'csrf-token'}));
    let sendFrame: (frame: string) => void = () => {};
    let closeStream: () => void = () => {};
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith('/search')) return new Response(JSON.stringify([drug]), {
            headers: {'Content-Type': 'application/json'}
        });
        const body = new ReadableStream<Uint8Array>({start(controller) {
            sendFrame = (frame) => controller.enqueue(new TextEncoder().encode(frame));
            closeStream = () => controller.close();
        }});
        return new Response(body, {headers: {'Content-Type': 'text/event-stream'}});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<Provider store={store}><SearchPanel/></Provider>);

    await user.type(screen.getByRole('textbox', {name: 'Drugs:'}), 'aspirin');
    await user.click(screen.getAllByRole('button', {name: 'Search'})[0]);
    await user.click(await screen.findByRole('button', {name: 'Add Aspirin'}));
    await user.type(screen.getByRole('textbox', {name: 'Ask about selected drugs'}), 'What is the risk?');
    await user.click(screen.getByRole('button', {name: 'Stream agent'}));
    expect(screen.getByRole('status').textContent).toContain('Analyzing selected medications');

    sendFrame('event: tool.started\ndata: {"tool":"search_fda_passages","callId":"call-1"}\n\n');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Retrieving FDA label passages'));
    sendFrame('event: generation.started\ndata: {}\n\n');
    sendFrame('event: answer.delta\ndata: {"text":"Grounded [1]."}\n\n');
    await screen.findByText('Grounded [1].');
    const source = {number: 1, drugName: 'Aspirin', section: 'warnings', text: 'Label evidence',
        sourceUrl: 'https://example.org/label', score: 0.9};
    const result = {answer: 'Grounded [1].', sources: [source], toolCalls: [], promptVersion: 'agent-tools-v1'};
    sendFrame(`event: sources\ndata: ${JSON.stringify({sources: [source]})}\n\n`);
    sendFrame(`event: agent.completed\ndata: ${JSON.stringify({traceId: 'trace-1', promptVersion: 'agent-tools-v1', result})}\n\n`);
    closeStream();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Answer complete'));
    expect(screen.getByRole('link', {name: 'FDA label'})).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/agent/ask/stream'), expect.objectContaining({
        credentials: 'include', headers: expect.objectContaining({'x-csrf-token': 'csrf-token'})
    }));
});

test('lets the user stop a stream and clears its partial answer', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith('/search')) return new Response(JSON.stringify([drug]), {
            headers: {'Content-Type': 'application/json'}
        });
        const body = new ReadableStream<Uint8Array>({start(controller) {
            controller.enqueue(new TextEncoder().encode('event: agent.started\ndata: {}\n\n'));
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
        }});
        return new Response(body, {headers: {'Content-Type': 'text/event-stream'}});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<Provider store={store}><SearchPanel/></Provider>);

    await user.type(screen.getByRole('textbox', {name: 'Drugs:'}), 'aspirin');
    await user.click(screen.getAllByRole('button', {name: 'Search'})[0]);
    await user.click(await screen.findByRole('button', {name: 'Add Aspirin'}));
    await user.type(screen.getByRole('textbox', {name: 'Ask about selected drugs'}), 'What is the risk?');
    await user.click(screen.getByRole('button', {name: 'Stream agent'}));
    await user.click(screen.getByRole('button', {name: 'Stop streaming'}));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Streaming stopped'));
    expect(screen.queryByRole('region', {name: 'Streaming agent answer from FDA labels'})).toBeNull();
});

test('shows an SSE error without keeping an unfinished answer', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith('/search')) return new Response(JSON.stringify([drug]), {
            headers: {'Content-Type': 'application/json'}
        });
        return new Response('event: error\ndata: {"code":"INTERNAL_ERROR","message":"Agent unavailable","traceId":"trace-1"}\n\n', {
            headers: {'Content-Type': 'text/event-stream'}
        });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<Provider store={store}><SearchPanel/></Provider>);

    await user.type(screen.getByRole('textbox', {name: 'Drugs:'}), 'aspirin');
    await user.click(screen.getAllByRole('button', {name: 'Search'})[0]);
    await user.click(await screen.findByRole('button', {name: 'Add Aspirin'}));
    await user.type(screen.getByRole('textbox', {name: 'Ask about selected drugs'}), 'What is the risk?');
    await user.click(screen.getByRole('button', {name: 'Stream agent'}));

    expect((await screen.findByRole('alert')).textContent).toContain('Agent unavailable');
    expect(screen.queryByRole('region', {name: 'Streaming agent answer from FDA labels'})).toBeNull();
});

test('searches, adds a drug once, and removes it from the graph', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify([drug]), {
        status: 200, headers: {'Content-Type': 'application/json'}
    }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<Provider store={store}><SearchPanel/></Provider>);

    await user.type(screen.getByRole('textbox', {name: 'Drugs:'}), 'aspirin');
    await user.click(screen.getAllByRole('button', {name: 'Search'})[0]);
    const addButton = await screen.findByRole('button', {name: 'Add Aspirin'});
    const searchRequest = fetchMock.mock.calls[0][0] as Request;
    expect(searchRequest.url).toContain('/search');
    expect(await searchRequest.clone().json()).toEqual({text: 'aspirin'});

    await user.click(addButton);
    await user.click(addButton);
    expect(screen.getAllByRole('button', {name: 'Remove Aspirin'})).toHaveLength(1);
    expect(screen.getByTestId('graph-drugs').textContent).toBe('Aspirin');

    await user.click(screen.getByRole('button', {name: 'Remove Aspirin'}));
    expect(screen.queryByRole('button', {name: 'Remove Aspirin'})).toBeNull();
    expect(screen.getByTestId('graph-drugs').textContent).toBe('');
    expect(screen.queryByText(/Results may be incomplete/)).toBeNull();
});

test('shows partial results and retries the same search instead of reusing its cache', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([drug]), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...(fetchMock.mock.calls.length === 1 ? {'X-Search-Partial': 'true'} : {})
        }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<Provider store={store}><SearchPanel/></Provider>);

    await user.type(screen.getByRole('textbox', {name: 'Drugs:'}), 'aspirin');
    await user.click(screen.getAllByRole('button', {name: 'Search'})[0]);
    expect(await screen.findByRole('button', {name: 'Add Aspirin'})).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Results may be incomplete');

    await user.type(screen.getByRole('textbox', {name: 'Drugs:'}), 'aspirin');
    await user.click(screen.getAllByRole('button', {name: 'Search'})[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
});
