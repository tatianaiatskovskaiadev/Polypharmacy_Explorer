import {Drug} from "../models/Drug.model.js"
import mongoose from "mongoose";
import {normalizeDrugName} from "../middlewares/normalization.js";
import {
    DRUG_EMBEDDING_PATH,
    VECTOR_CANDIDATES_MULTIPLIER,
    VECTOR_SEARCH_INDEX,
    VECTOR_SIMILARITY_THRESHOLD
} from "../utils/constants.js";

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createDrug = async (drug) => await Drug.create({
    ...drug,
    normalizedName: normalizeDrugName(drug.name)
});

export const upsertInternationalDrug = async ({name, activeIngredient, source, sourceUrl, verificationSource, verificationUrl}) => (
    await Drug.findOneAndUpdate(
        {normalizedName: normalizeDrugName(name)},
        {$setOnInsert: {
            name,
            normalizedName: normalizeDrugName(name),
            activeIngredient,
            guidelines: {
                source,
                sourceUrl,
                ...(verificationSource ? {verificationSource, verificationUrl} : {})
            }
        }},
        {upsert: true, returnDocument: 'after', runValidators: true}
    )
);

export const getDrugsByIds = async (drugIds) => await Drug.find({ _id: { $in: drugIds } })
    .select('-guidelines.embedding');

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

export const getDrugByName = async (name, {excludeEmbedding = false} = {}) => {
    const normalizedName = normalizeDrugName(name);
    const query = Drug.find({
        $or: [
            {normalizedName},
            {name: {$regex: escapeRegex(name.trim()), $options: 'i'}}
        ]
    });
    return await (excludeEmbedding ? query.select('-guidelines.embedding') : query);
}

export const updateDrug = async (id, data) => {
    const normalizedData = data.name
        ? {
            ...data,
            normalizedName: normalizeDrugName(data.name)
        }
        : data;

    return Drug.findByIdAndUpdate(
        id,
        {$set: normalizedData},
        {
            returnDocument: 'after',
            runValidators: true
        }
    );
};
