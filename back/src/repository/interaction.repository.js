import {Interaction} from "../models/Interaction.model.js";

// A pair is always stored in canonical order (smaller id first) so that the unique
// index {drugA, drugB} also protects against the reversed duplicate (B, A)
export const toCanonicalPair = (drugIdA, drugIdB) => [String(drugIdA), String(drugIdB)].sort();

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

export const searchInteractionsByText = async (text, drugIds) => {
    const query = new RegExp(escapeRegex(text.trim()), 'i');

    return await Interaction.find({
        drugA: {$in: drugIds},
        drugB: {$in: drugIds},
        $or: [
            {description: query},
            {actionRequired: query}
        ]
    });
}
