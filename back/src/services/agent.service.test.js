import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const completeAgentTurn = jest.fn();
const createVector = jest.fn();
const getDrugsByIds = jest.fn();
const searchPassages = jest.fn();
const checkInteraction = jest.fn();

jest.unstable_mockModule('./ai.service.js', () => ({completeAgentTurn, createVector}));
jest.unstable_mockModule('../repository/drug.repository.js', () => ({getDrugsByIds}));
jest.unstable_mockModule('../repository/fda-passage.repository.js', () => ({searchPassages}));
jest.unstable_mockModule('./interaction.service.js', () => ({checkInteraction}));

const {askAgent, executeAgent} = await import('./agent.service.js');

describe('drug agent', () => {
    beforeEach(() => {
        completeAgentTurn.mockReset();
        createVector.mockReset();
        getDrugsByIds.mockReset();
        searchPassages.mockReset();
        checkInteraction.mockReset();
    });

    test('executes a selected-drug FDA search and returns cited evidence', async () => {
        completeAgentTurn
            .mockResolvedValueOnce({
                content: null,
                tool_calls: [{
                    id: 'call-1',
                    type: 'function',
                    function: {name: 'search_fda_passages', arguments: '{"query":"bleeding risk"}'}
                }]
            })
            .mockResolvedValueOnce({content: 'The label describes bleeding risk [1].'});
        createVector.mockResolvedValueOnce([0.1, 0.2]);
        searchPassages.mockResolvedValueOnce([{
            _id: 'passage-1',
            drugName: 'Drug A',
            section: 'drug_interactions',
            text: 'Bleeding risk is described.',
            sourceUrl: 'https://example.com/label',
            score: 0.9
        }]);

        const result = await askAgent('What does the label say about bleeding?', ['drug-1']);

        expect(searchPassages).toHaveBeenCalledWith([0.1, 0.2], ['drug-1']);
        expect(result.sources).toEqual([expect.objectContaining({number: 1, drugName: 'Drug A'})]);
        expect(result.toolCalls).toEqual([{name: 'search_fda_passages', status: 'ok'}]);
        expect(completeAgentTurn.mock.calls[0][2]).toBe('required');
        expect(completeAgentTurn.mock.calls[1][0]).toEqual(expect.arrayContaining([
            expect.objectContaining({role: 'tool', tool_call_id: 'call-1'})
        ]));
    });

    test('rejects tool arguments that try to change the selected drug scope', async () => {
        completeAgentTurn
            .mockResolvedValueOnce({
                content: null,
                tool_calls: [{
                    id: 'call-2',
                    type: 'function',
                    function: {name: 'check_selected_interactions', arguments: '{"drugIds":["other-drug"]}'}
                }]
            })
            .mockResolvedValueOnce({content: 'No evidence is available.'});

        const result = await askAgent('Check the interaction', ['drug-1', 'drug-2']);

        expect(checkInteraction).not.toHaveBeenCalled();
        expect(result.sources).toEqual([]);
        expect(result.answer).toContain('do not provide enough evidence');
        expect(result.toolCalls).toEqual([{name: 'check_selected_interactions', status: 'error'}]);
    });

    test('passes only selected IDs to the interaction service', async () => {
        completeAgentTurn
            .mockResolvedValueOnce({
                content: null,
                tool_calls: [{
                    id: 'call-3',
                    type: 'function',
                    function: {name: 'check_selected_interactions', arguments: '{}'}
                }]
            })
            .mockResolvedValueOnce({content: 'More FDA evidence is needed.'});
        checkInteraction.mockResolvedValueOnce({interactions: [], failedPairs: []});

        const result = await askAgent('Check these drugs', ['drug-1', 'drug-2']);

        expect(checkInteraction).toHaveBeenCalledWith(['drug-1', 'drug-2']);
        expect(result.toolCalls).toEqual([{name: 'check_selected_interactions', status: 'ok'}]);
        expect(result.sources).toEqual([]);
    });

    test('streams operational events and the same citation-gated result as the JSON path', async () => {
        const passage = {
            number: 1, drugName: 'Drug A', section: 'warnings', text: 'Label evidence',
            sourceUrl: 'https://example.com/label', score: 0.9
        };
        const dependencies = () => {
            const turns = [
                {tool_calls: [{id: 'call-1', function: {name: 'search_fda_passages', arguments: '{"query":"risk"}'}}]},
                {content: 'The label describes a risk [1].'}
            ];
            return {
                completeAgentTurn: async () => turns.shift(),
                createAgentTools: () => ({
                    sources: [passage],
                    execute: async () => ({passages: [passage]})
                })
            };
        };
        const normal = await askAgent('What risk?', ['drug-1'], dependencies());
        const events = [];
        const streamed = await executeAgent('What risk?', ['drug-1'], {
            dependencies: dependencies(),
            onEvent: (event, data) => events.push({event, data})
        });

        expect(streamed).toEqual(normal);
        expect(events.map(({event}) => event)).toEqual([
            'agent.started', 'tool.started', 'tool.completed', 'retrieval.completed',
            'generation.started', 'answer.delta', 'sources', 'agent.completed'
        ]);
        expect(events.find(({event}) => event === 'tool.completed').data).toEqual(expect.objectContaining({
            tool: 'search_fda_passages', callId: 'call-1', status: 'ok', durationMs: expect.any(Number)
        }));
        expect(events.find(({event}) => event === 'agent.completed').data.result).toEqual(normal);
    });

    test('does not stream an ungrounded draft and stops after cancellation', async () => {
        const events = [];
        await executeAgent('What risk?', ['drug-1'], {
            dependencies: {
                completeAgentTurn: async () => ({content: 'Unsupported claim [2].'}),
                createAgentTools: () => ({sources: [{number: 1}], execute: async () => ({})})
            },
            onEvent: (event, data) => events.push({event, data})
        });
        expect(events.filter(({event}) => event === 'answer.delta').map(({data}) => data.text).join(''))
            .toContain('do not provide enough evidence');
        expect(JSON.stringify(events)).not.toContain('Unsupported claim');

        const controller = new AbortController();
        const completeTurn = jest.fn();
        await expect(executeAgent('What risk?', ['drug-1'], {
            signal: controller.signal,
            dependencies: {
                completeAgentTurn: completeTurn,
                createAgentTools: () => ({sources: [], execute: async () => ({})})
            },
            onEvent: (event) => {
                if (event === 'agent.started') controller.abort();
            }
        })).rejects.toMatchObject({name: 'AbortError'});
        expect(completeTurn).not.toHaveBeenCalled();
    });
});
