import {Drug} from "../models/Drug.model.js"
import mongoose from "mongoose";
import {
    DRUG_EMBEDDING_PATH,
    VECTOR_CANDIDATES_MULTIPLIER,
    VECTOR_SEARCH_INDEX,
    VECTOR_SIMILARITY_THRESHOLD
} from "../utils/constants.js";

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createDrug = async (drug) => await Drug.create(drug);

export const getDrugsByIds = async (drugIds) => await Drug.find({ _id: { $in: drugIds } });

export const getDrug = async (vectorSymptom, drugIds) => {
    const ids = drugIds.map(
        id => new mongoose.Types.ObjectId(id)
    );
    const numCandidates = Math.max(
        drugIds.length * VECTOR_CANDIDATES_MULTIPLIER,
        drugIds.length
    );

    const pipeline = [
        {
            $vectorSearch: {
                index: VECTOR_SEARCH_INDEX,
                path: DRUG_EMBEDDING_PATH,
                queryVector: vectorSymptom,
                filter: {
                    _id: {$in: ids}
                },
                limit: drugIds.length,
                numCandidates
            }
        },
        {
            $set: {
                score: {
                    $meta: "vectorSearchScore"
                }
            }
        },

        {
            $match: {
                score: {
                    $gte: VECTOR_SIMILARITY_THRESHOLD
                }
            }
        },

        {
            $project: {
                "guidelines.embedding": 0
            }
        }
    ];

    return await Drug.aggregate(pipeline);
};

export const getDrugByName = async (name) => {
    return await Drug.find({ name: { $regex: escapeRegex(name), $options: 'i' } });
}

export const updateDrug = async (id, data) => {
    return Drug.findByIdAndUpdate(
        id,
        {$set: data},
        {
            returnDocument: 'after',
            runValidators: true
        }
    );
};
