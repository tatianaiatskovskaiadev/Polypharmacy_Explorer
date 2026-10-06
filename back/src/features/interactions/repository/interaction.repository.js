import {Interaction} from "../models/Interaction.model.js";
import mongoose from 'mongoose';
import {ExternalServiceError} from '../../../utils/errors.js';
import {
    INTERACTION_RETRIEVAL_LIMIT,
    INTERACTION_SIMILARITY_THRESHOLD,
    INTERACTION_VECTOR_INDEX,
    VECTOR_CANDIDATES_MULTIPLIER
} from '../../../utils/constants.js';

// A pair is always stored in canonical order (smaller id first) so that the unique
// index {drugA, drugB} also protects against the reversed duplicate (B, A)
export const toCanonicalPair = (drugIdA, drugIdB) => [String(drugIdA), String(drugIdB)].sort();

export const listInteractionSearchIndexes = () => Interaction.collection.listSearchIndexes().toArray();
export const createInteractionSearchIndex = () => Interaction.collection.createSearchIndex({
    name: INTERACTION_VECTOR_INDEX,
    type: 'vectorSearch',
    definition: {
        fields: [
            {type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine'},
            {type: 'filter', path: 'drugA'},
            {type: 'filter', path: 'drugB'}
        ]
    }
});
export const iterateInteractionsForBackfill = () => Interaction.collection.find({}, {
    projection: {description: 1, actionRequired: 1, riskLevel: 1, searchText: 1, embedding: 1, embeddingModel: 1}
});
export const updateInteractionEmbedding = (interaction, searchText, embedding, embeddingModel) => (
    Interaction.collection.updateOne({
        _id: interaction._id,
        description: interaction.description,
        actionRequired: interaction.actionRequired,
        riskLevel: interaction.riskLevel
    }, {$set: {searchText, embedding, embeddingModel}})
);

export const checkInteraction = async (drugIds) => {
    return await Interaction.find({$and: [{drugA: {$in: drugIds}}, {drugB: {$in: drugIds}}]});
}

export const upsertInteraction = async ({drugA, drugB, ...fields}) => {
    const [first, second] = toCanonicalPair(drugA, drugB);
    return await Interaction.findOneAndUpdate(
        { drugA: first, drugB: second },
        { $set: fields },
        { upsert: true, returnDocument: 'after', runValidators: true }
    );
}

export const getInteractionPair = async (drugIdA, drugIdB) => {
    // $or keeps compatibility with pairs saved before canonical ordering was introduced
    return await Interaction.findOne({
        $or: [
            { drugA: drugIdA, drugB: drugIdB },
            { drugA: drugIdB, drugB: drugIdA }
        ]
    });
}

export const searchInteractionsByVector = async (vector, drugIds) => {
    if (drugIds.length < 2) return [];
    const indexes = await listInteractionSearchIndexes();
    if (!indexes.some(({name, queryable}) => name === INTERACTION_VECTOR_INDEX && queryable)) {
        throw new ExternalServiceError('Interaction search index is not ready');
    }
    const ids = drugIds.map((id) => new mongoose.Types.ObjectId(id));
    const pairCount = drugIds.length * (drugIds.length - 1) / 2;
    const limit = Math.min(pairCount, INTERACTION_RETRIEVAL_LIMIT);
    return await Interaction.aggregate([
        {
            $vectorSearch: {
                index: INTERACTION_VECTOR_INDEX,
                path: 'embedding',
                queryVector: vector,
                filter: {drugA: {$in: ids}, drugB: {$in: ids}},
                numCandidates: Math.max(limit * VECTOR_CANDIDATES_MULTIPLIER, limit),
                limit
            }
        },
        {$set: {score: {$meta: 'vectorSearchScore'}}},
        {$match: {score: {$gte: INTERACTION_SIMILARITY_THRESHOLD}}},
        {$project: {embedding: 0, searchText: 0, embeddingModel: 0}}
    ]);
};
