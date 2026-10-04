import {afterEach, expect, test, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Provider} from 'react-redux';
import {store} from '../app/store.ts';
import {drugApi} from '../features/api/drugApi.ts';
import type {Drug} from '../utils/types';
import SearchPanel from './SearchPanel.tsx';

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
    vi.unstubAllGlobals();
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
});
