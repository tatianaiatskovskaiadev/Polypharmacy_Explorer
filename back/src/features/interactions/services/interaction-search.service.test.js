import {describe, expect, test} from '@jest/globals';
import {buildInteractionSearchText, needsInteractionEmbedding} from './interaction-search.service.js';
import {OPENAI_EMBEDDING_MODEL} from '../../../utils/constants.js';

describe('interaction search text', () => {
    test('combines the saved summary, action and severity without synonym rules', () => {
        expect(buildInteractionSearchText({
            description: ' Elevation of prothrombin times ',
            actionRequired: 'Monitor INR',
            riskLevel: 'major'
        })).toBe('Elevation of prothrombin times\nMonitor INR\nmajor');
    });

    test('only re-embeds records with missing or stale vectors', () => {
        const interaction = {
            description: 'Prolongation of prothrombin time',
            actionRequired: 'Monitor INR',
            riskLevel: 'major',
            searchText: 'Prolongation of prothrombin time\nMonitor INR\nmajor',
            embeddingModel: OPENAI_EMBEDDING_MODEL,
            embedding: [0.1]
        };
        expect(needsInteractionEmbedding(interaction)).toBe(false);
        expect(needsInteractionEmbedding({...interaction, embedding: []})).toBe(true);
        expect(needsInteractionEmbedding({...interaction, description: 'Changed'})).toBe(true);
    });
});
