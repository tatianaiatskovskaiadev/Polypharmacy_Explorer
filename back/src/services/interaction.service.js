import {fetchRawInteraction} from "./fda.service.js";
import {normalizeInteractionText} from "./ai.service.js";
import * as interactionRepository from "../repository/interaction.repository.js";
import * as drugRepository from "../repository/drug.repository.js";
import {COLOR_BY_RISK} from "../utils/constants.js";

export const checkInteraction = async (drugIds) => {
    if (drugIds.length < 2) return [];

    const drugs = await drugRepository.getDrugsByIds(drugIds);

    const pairs = [];
    for (let i = 0; i < drugs.length; i++) {
        for (let j = i + 1; j < drugs.length; j++) {
            pairs.push([drugs[i], drugs[j]]);
        }
    }

    for (const [drugA, drugB] of pairs) {
        const searchNameA = drugA.activeIngredient || drugA.name;
        const searchNameB = drugB.activeIngredient || drugB.name;
        await syncInteraction(drugA._id, drugB._id, searchNameA, searchNameB);
    }

    return await interactionRepository.checkInteraction(drugIds);
}

export const syncInteraction = async (drugIdA, drugIdB, drugNameA, drugNameB) => {
    const existingInteraction = await interactionRepository.getInteractionPair(drugIdA, drugIdB);
    if (existingInteraction) {
        return existingInteraction;
    }

    console.log(`Interaction ${drugNameA} + ${drugNameB} not cached, analyzing via FDA/AI`);
    const rawText = await fetchRawInteraction(drugNameA, drugNameB);
    if (!rawText) return null;

    const {riskLevel, description, actionRequired} = await normalizeInteractionText(rawText);

    return await interactionRepository.upsertInteraction({
        drugA: drugIdA,
        drugB: drugIdB,
        riskLevel,
        colorCode: COLOR_BY_RISK[riskLevel],
        description,
        actionRequired
    });
}

