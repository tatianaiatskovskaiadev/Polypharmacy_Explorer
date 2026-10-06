import * as interactionRepository from '../repository/interaction.repository.js';
import {createVector} from '../../ai/services/ai.service.js';
import {buildInteractionSearchText, needsInteractionEmbedding} from './interaction-search.service.js';
import {INTERACTION_VECTOR_INDEX, OPENAI_EMBEDDING_MODEL} from '../../../utils/constants.js';

export const backfillInteractionVectors = async ({dryRun = false, onIndexCreated} = {}) => {
    const indexes = await interactionRepository.listInteractionSearchIndexes();
    const indexMissing = !indexes.some(({name}) => name === INTERACTION_VECTOR_INDEX);
    if (indexMissing && !dryRun) {
        await interactionRepository.createInteractionSearchIndex();
        onIndexCreated?.();
    }

    let scanned = 0;
    let updated = 0;
    for await (const interaction of interactionRepository.iterateInteractionsForBackfill()) {
        scanned++;
        if (!needsInteractionEmbedding(interaction)) continue;
        if (dryRun) {
            updated++;
            continue;
        }
        const searchText = buildInteractionSearchText(interaction);
        const embedding = await createVector(searchText);
        const result = await interactionRepository.updateInteractionEmbedding(
            interaction, searchText, embedding, OPENAI_EMBEDDING_MODEL
        );
        updated += result.modifiedCount;
    }
    return {scanned, updated, indexMissing};
};
