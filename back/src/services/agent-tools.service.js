import {createVector} from './ai.service.js';
import * as drugRepository from '../repository/drug.repository.js';
import * as passageRepository from '../repository/fda-passage.repository.js';
import * as interactionService from './interaction.service.js';
import {recordRetrieval} from '../eval/metrics.js';

export const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_selected_drugs',
            description: 'Get names and active ingredients of the drugs selected by the user.',
            parameters: {type: 'object', properties: {}, required: [], additionalProperties: false},
            strict: true
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_selected_interactions',
            description: 'Check or retrieve cached pairwise interactions for the selected drugs. Results are AI summaries and need FDA passage support before making claims.',
            parameters: {type: 'object', properties: {}, required: [], additionalProperties: false},
            strict: true
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_fda_passages',
            description: 'Search indexed FDA label excerpts for evidence about the selected drugs. Use a focused search query and cite the returned numbered passages.',
            parameters: {
                type: 'object',
                properties: {query: {type: 'string', description: 'Focused question or medication risk phrase'}},
                required: ['query'],
                additionalProperties: false
            },
            strict: true
        }
    }
];

export const createAgentTools = (drugIds, {signal} = {}) => {
    const sources = [];
    let searchCount = 0;
    let interactionChecked = false;

    const execute = async (name, args) => {
        signal?.throwIfAborted();
        if (name === 'get_selected_drugs') {
            if (Object.keys(args).length !== 0) return {error: 'No arguments are allowed'};
            const drugs = await drugRepository.getDrugsByIds(drugIds);
            signal?.throwIfAborted();
            return {drugs: drugs.map(({_id, name: drugName, activeIngredient}) => ({
                drugId: String(_id), name: drugName, activeIngredient
            }))};
        }

        if (name === 'check_selected_interactions') {
            if (Object.keys(args).length !== 0) return {error: 'No arguments are allowed'};
            if (interactionChecked) return {error: 'Interaction check already completed'};
            interactionChecked = true;
            const result = await interactionService.checkInteraction(drugIds);
            signal?.throwIfAborted();
            return {
                interactions: result.interactions.map((interaction) => ({
                    drugA: String(interaction.drugA),
                    drugB: String(interaction.drugB),
                    riskLevel: interaction.riskLevel,
                    description: interaction.description,
                    actionRequired: interaction.actionRequired
                })),
                failedPairs: result.failedPairs
            };
        }

        if (name === 'search_fda_passages') {
            if (Object.keys(args).length !== 1 || typeof args.query !== 'string' ||
                args.query.trim().length < 3 || args.query.length > 500) {
                return {error: 'A query between 3 and 500 characters is required'};
            }
            if (searchCount >= 2) return {error: 'FDA passage search limit reached'};
            searchCount++;
            const vector = await createVector(args.query.trim(), {signal});
            signal?.throwIfAborted();
            const passages = await passageRepository.searchPassages(vector, drugIds);
            signal?.throwIfAborted();
            recordRetrieval(passages);
            const matches = passages.map((passage) => {
                const passageId = String(passage._id);
                let source = sources.find((item) => item.passageId === passageId);
                if (!source) {
                    source = {
                        passageId,
                        number: sources.length + 1,
                        drugName: passage.drugName,
                        section: passage.section,
                        text: passage.text,
                        sourceUrl: passage.sourceUrl,
                        score: passage.score
                    };
                    sources.push(source);
                }
                return {number: source.number, drugName: source.drugName, section: source.section, text: source.text};
            });
            return {passages: matches};
        }

        return {error: 'Unknown tool'};
    };

    return {execute, sources};
};
