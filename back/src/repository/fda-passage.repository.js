import mongoose from 'mongoose';
import {FdaPassage} from '../models/FdaPassage.model.js';
import {
    FDA_PASSAGE_SIMILARITY_THRESHOLD,
    FDA_PASSAGE_VECTOR_INDEX,
    RAG_RETRIEVAL_LIMIT,
    VECTOR_CANDIDATES_MULTIPLIER
} from '../utils/constants.js';

export const getPassagesByDrugId = async (drugId) => (
    await FdaPassage.find({drugId}).lean()
);

export const replacePassages = async (drugId, passages) => {
    if (passages.length === 0) return;
    const keys = passages.map(({labelId, section, chunkIndex}) => ({labelId, section, chunkIndex}));
    await FdaPassage.bulkWrite(passages.map((passage) => ({
        updateOne: {
            filter: {drugId, labelId: passage.labelId, section: passage.section, chunkIndex: passage.chunkIndex},
            update: {$set: passage},
            upsert: true
        }
    })));
    await FdaPassage.deleteMany({drugId, $nor: keys});
};

export const searchPassages = async (vector, drugIds) => {
    const ids = drugIds.map((id) => new mongoose.Types.ObjectId(id));
    const limit = RAG_RETRIEVAL_LIMIT;
    return await FdaPassage.aggregate([
        {
            $vectorSearch: {
                index: FDA_PASSAGE_VECTOR_INDEX,
                path: 'embedding',
                queryVector: vector,
                filter: {drugId: {$in: ids}},
                numCandidates: Math.max(limit * VECTOR_CANDIDATES_MULTIPLIER, limit),
                limit
            }
        },
        {$set: {score: {$meta: 'vectorSearchScore'}}},
        {$match: {score: {$gte: FDA_PASSAGE_SIMILARITY_THRESHOLD}}},
        {$project: {embedding: 0}}
    ]);
};
