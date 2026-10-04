import {fetchInteractionFromFDA} from "./fda.service.js";
import {fetchInteractionFromDailyMed} from './dailymed.service.js';
import {normalizeInteractionText} from "./ai.service.js";
import * as interactionRepository from "../repository/interaction.repository.js";
import * as drugRepository from "../repository/drug.repository.js";
import {COLOR_BY_RISK, INTERACTION_ANALYSIS_VERSION, INTERACTION_SYNC_CONCURRENCY} from "../utils/constants.js";
import {ExternalServiceError} from "../utils/errors.js";

const inFlightInteractionSyncs = new Map();

const runWithConcurrency = async (items, limit, task) => {
    const workers = Array.from(
        {length: Math.min(limit, items.length)},
        async (_, workerIndex) => {
            for (let index = workerIndex; index < items.length; index += limit) {
                await task(items[index]);
            }
        }
    );

    await Promise.all(workers);
};

export const checkInteraction = async (drugIds) => {
    if (drugIds.length < 2) {
        return {
            interactions: [],
            failedPairs: []
        };
    }

    const drugs = await drugRepository.getDrugsByIds(drugIds);
    const failedPairs = [];

    const pairs = [];
    for (let i = 0; i < drugs.length; i++) {
        for (let j = i + 1; j < drugs.length; j++) {
            pairs.push([drugs[i], drugs[j]]);
        }
    }

    await runWithConcurrency(pairs, INTERACTION_SYNC_CONCURRENCY, async ([drugA, drugB]) => {
        const searchNameA = drugA.activeIngredient || drugA.name;
        const searchNameB = drugB.activeIngredient || drugB.name;
        try {
            await syncInteraction(drugA._id, drugB._id, searchNameA, searchNameB);
        } catch (error) {
            if (!(error instanceof ExternalServiceError)) {
                throw error;
            }

            failedPairs.push({
                drugIdA: drugA._id.toString(),
                drugIdB: drugB._id.toString(),
                drugNameA: searchNameA,
                drugNameB: searchNameB,
                reason: error.message
            });
        }
    });

    const interactions = await interactionRepository.checkInteraction(drugIds);
    return {
        interactions,
        failedPairs
    };
}

const syncInteractionWithoutLock = async (drugIdA, drugIdB, drugNameA, drugNameB) => {
    const existingInteraction = await interactionRepository.getInteractionPair(drugIdA, drugIdB);
    if (existingInteraction?.analysisVersion === INTERACTION_ANALYSIS_VERSION) {
        return existingInteraction;
    }

    let evidence;
    let sourceError;
    for (const lookup of [fetchInteractionFromFDA, fetchInteractionFromDailyMed]) {
        try {
            evidence = await lookup(drugNameA, drugNameB);
            if (evidence) break;
        } catch (error) {
            if (!(error instanceof ExternalServiceError)) throw error;
            sourceError ??= error;
        }
    }

    if (!evidence) {
        if (existingInteraction) return existingInteraction;
        if (sourceError) throw sourceError;
        return null;
    }

    let normalizedInteraction;
    try {
        normalizedInteraction = await normalizeInteractionText(evidence.text, {
            drugNameA,
            drugNameB
        });
    } catch (error) {
        if (existingInteraction && error instanceof ExternalServiceError) {
            return existingInteraction;
        }

        throw error;
    }

    const {riskLevel, description, actionRequired} = normalizedInteraction;

    return await interactionRepository.upsertInteraction({
        drugA: drugIdA,
        drugB: drugIdB,
        riskLevel,
        colorCode: COLOR_BY_RISK[riskLevel],
        description,
        actionRequired,
        source: evidence.source,
        sourceUrl: evidence.sourceUrl,
        sourceText: evidence.text,
        sourceRetrievedAt: new Date(),
        analysisVersion: INTERACTION_ANALYSIS_VERSION
    });
}

export const syncInteraction = async (drugIdA, drugIdB, drugNameA, drugNameB) => {
    const interactionKey = interactionRepository.toCanonicalPair(drugIdA, drugIdB).join(':');
    const inFlightSync = inFlightInteractionSyncs.get(interactionKey);
    if (inFlightSync) {
        return await inFlightSync;
    }

    const syncPromise = syncInteractionWithoutLock(drugIdA, drugIdB, drugNameA, drugNameB)
        .finally(() => {
            if (inFlightInteractionSyncs.get(interactionKey) === syncPromise) {
                inFlightInteractionSyncs.delete(interactionKey);
            }
        });

    inFlightInteractionSyncs.set(interactionKey, syncPromise);
    return await syncPromise;
}
