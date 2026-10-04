import {afterEach, expect, test, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {Drug} from '../utils/types';
import List from './List.tsx';

const drug: Drug = {
    _id: 'drug-1', name: 'Aspirin', activeIngredient: 'acetylsalicylic acid',
    guidelines: {source: 'FDA', sourceUrl: 'https://example.com/label'}
};

afterEach(cleanup);

test('adds a search result by keyboard and keeps its source link separate', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<List data={[drug]} isLoading={false} isError={false} onAdd={onAdd}/>);

    const addButton = screen.getByRole('button', {name: 'Add Aspirin'});
    addButton.focus();
    await user.keyboard('{Enter}');

    expect(onAdd).toHaveBeenCalledExactlyOnceWith(drug);
    expect(screen.getByRole('link', {name: 'FDA'}).getAttribute('href')).toBe('https://example.com/label');
});

test('shows an empty result state', () => {
    render(<List data={[]} isLoading={false} isError={false} onAdd={vi.fn()}/>);
    expect(screen.getByText('No drugs found.')).toBeTruthy();
});

test('labels a drug without verified provenance as unknown', () => {
    render(<List data={[{...drug, guidelines: {source: 'Unknown'}}]}
                 isLoading={false} isError={false} onAdd={vi.fn()}/>);

    expect(screen.getByText('Source: Unknown. FDA label evidence is unavailable.')).toBeTruthy();
});

test('labels an administrator supplied drug as Manual', () => {
    render(<List data={[{...drug, guidelines: {source: 'Manual'}}]}
                 isLoading={false} isError={false} onAdd={vi.fn()}/>);

    expect(screen.getByText('Source: Manual. FDA label evidence is unavailable.')).toBeTruthy();
});
