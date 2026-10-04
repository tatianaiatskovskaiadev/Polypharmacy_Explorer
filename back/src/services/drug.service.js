import * as drugRepository from '../repository/drug.repository.js';
import * as interactionRepository from '../repository/interaction.repository.js';
import * as searchCacheRepository from '../repository/drug-search-cache.repository.js';
import {createHash} from 'crypto';
import {createVector} from './ai.service.js';
import {fetchAnaloguesFromFDA} from './fda.service.js';
import {findDailyMedDrug} from './dailymed.service.js';
import {resolveIngredientFromPubChem} from './ingredient-resolution.service.js';
import {indexFdaPassages} from './fda-passage.service.js';
import {ExternalServiceError} from '../utils/errors.js';
import {
    DRUG_SEARCH_FALLBACK_CACHE_TTL_MS,
    MAX_EMBEDDING_TEXT_LENGTH,
    MAX_FDA_SECTION_LENGTH
} from '../utils/constants.js';

const limitText = (text, maxLength) => (
    text.length > maxLength
        ? text.slice(0, maxLength)
        : text
);

const buildEmbeddingText = (item) => {
    const sections = [
        item.boxed_warning?.[0],
        item.warnings?.[0],
        item.warnings_and_cautions?.[0],
        item.adverse_reactions?.[0],
        item.contraindications?.[0],
        item.drug_interactions?.[0],
        item.indications_and_usage?.[0],
        item.description?.[0]
    ]
        .filter(Boolean)
        .map(section => limitText(section, MAX_FDA_SECTION_LENGTH));

    return limitText(sections.join('\n\n'), MAX_EMBEDDING_TEXT_LENGTH);
};

const createContentHash = (text) => (
    createHash('sha256')
        .update(text)
        .digest('hex')
);

const hasReusableGuidelines = (drug, embeddingText) => (
    Boolean(drug.guidelines?.originalText) &&
    drug.guidelines?.contentHash === createContentHash(embeddingText) &&
    Array.isArray(drug.guidelines?.embedding) &&
    drug.guidelines.embedding.length > 0
);

const normalizeSearchText = (value) => (
    String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
);

const splitIngredients = (activeIngredient) => (
    String(activeIngredient ?? '')
        .split(/;|,|\s+and\s+/i)
        .map((ingredient) => normalizeSearchText(ingredient).replace(/^and\s+/, ''))
        .filter(Boolean)
);

const hasMultipleIngredients = (activeIngredient) => splitIngredients(activeIngredient).length > 1;

const normalizeIngredientBase = (value) => normalizeSearchText(value)
    .replace(/\s+(hydrochloride|hcl|hydrobromide|hbr)$/i, '');

const isExactIngredientLabel = (item, ingredient) => {
    const genericName = item.openfda?.generic_name?.[0] ?? '';
    return !hasMultipleIngredients(genericName) &&
        normalizeIngredientBase(genericName) === normalizeIngredientBase(ingredient);
};

const tryOfficialLookup = async (lookup, name) => {
    try {
        return await lookup(name);
    } catch (error) {
        if (!(error instanceof ExternalServiceError)) throw error;
        console.error('Official drug lookup failed:', error);
        return null;
    }
};

const isCombinationLabel = (value) => /\s+and\s+|,|;/.test(normalizeSearchText(value));

const isSingleIngredientMatch = (drug, normalizedSearchText) => {
    const ingredients = splitIngredients(drug.activeIngredient);
    return ingredients.length === 1 && ingredients[0].includes(normalizedSearchText);
};

const scoreLocalDrugMatch = (drug, searchText) => {
    const normalizedSearchText = normalizeSearchText(searchText);
    const normalizedName = normalizeSearchText(drug.name);
    const ingredients = splitIngredients(drug.activeIngredient);

    if (normalizedName === normalizedSearchText) return 100;
    if (ingredients.includes(normalizedSearchText)) {
        return isCombinationLabel(drug.name) ? 75 : 90;
    }
    if (isSingleIngredientMatch(drug, normalizedSearchText)) return 80;
    if (normalizedName.startsWith(normalizedSearchText)) return 70;
    if (ingredients.some((ingredient) => ingredient.includes(normalizedSearchText))) return 60;
    if (normalizedName.includes(normalizedSearchText)) return 50;

    return 0;
};

const rankLocalDrugs = (drugs, searchText) => (
    [...drugs].sort((drugA, drugB) => (
        scoreLocalDrugMatch(drugB, searchText) - scoreLocalDrugMatch(drugA, searchText)
    ))
);

const getFdaItemName = (item) => item.openfda?.brand_name?.[0] ?? '';

const getFdaItemIngredient = (item) => item.openfda?.generic_name?.[0] ?? '';

const getFdaLabelUrl = (item, ingredient) => (
    `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(
        item.id ? `id:${item.id}` : `openfda.generic_name:"${ingredient}"`
    )}`
);

const scoreFdaAnalogue = (item, searchText) => {
    const normalizedSearchText = normalizeSearchText(searchText);
    const normalizedName = normalizeSearchText(getFdaItemName(item));
    const normalizedIngredient = normalizeSearchText(getFdaItemIngredient(item));
    const ingredients = splitIngredients(normalizedIngredient);
    const isCombination = hasMultipleIngredients(normalizedIngredient);

    if (normalizedIngredient === normalizedSearchText) return 100;
    if (normalizedName === normalizedSearchText) return 95;
    if (!isCombination && normalizedIngredient.startsWith(normalizedSearchText)) return 90;
    if (!isCombination && normalizedIngredient.includes(normalizedSearchText)) return 80;
    if (ingredients.includes(normalizedSearchText)) return 70;
    if (normalizedName.includes(normalizedSearchText)) return 60;
    if (normalizedIngredient.includes(normalizedSearchText)) return 50;

    return 0;
};

const rankFdaAnalogues = (items, searchText) => (
    [...items].sort((itemA, itemB) => (
        scoreFdaAnalogue(itemB, searchText) - scoreFdaAnalogue(itemA, searchText)
    ))
);

const mergeRankedDrugResults = (primaryDrugs, secondaryDrugs, searchText) => {
    const byNormalizedName = new Map();

    for (const drug of [...primaryDrugs, ...secondaryDrugs]) {
        const key = normalizeSearchText(drug.name);
        if (!key || byNormalizedName.has(key)) continue;
        byNormalizedName.set(key, drug);
    }

    return rankLocalDrugs([...byNormalizedName.values()], searchText);
};

export const createDrug = async (drug) => {
    const {
        name,
        activeIngredient,
        originalText
    } = drug;

    const embedding = originalText ? await createVector(originalText) : [];

    const data = {
        name,
        activeIngredient,
        guidelines: {
            source: 'FDA',
            originalText,
            contentHash: originalText
                ? createContentHash(originalText)
                : undefined,
            embedding
        }
    };

    return await drugRepository.createDrug(data);
};

export const getSimilarDrugs = async (text) => {
    const searchText = normalizeSearchText(text);
    const cachedIds = await searchCacheRepository.getCachedDrugIds(searchText);
    if (Array.isArray(cachedIds)) {
        if (cachedIds.length === 0) return [];
        const cachedDrugs = await drugRepository.getDrugsByIds(cachedIds);
        if (cachedDrugs.length === cachedIds.length) {
            return rankLocalDrugs(cachedDrugs, text);
        }
    }

    const localDrugs = rankLocalDrugs(
        await drugRepository.getDrugByName(text, {excludeEmbedding: true}), text
    ).filter((drug) => scoreLocalDrugMatch(drug, text) >= 70);
    if (localDrugs.length > 0) {
        await searchCacheRepository.saveSearchResult(searchText, localDrugs);
        return localDrugs;
    }

    let fdaAnalogues = rankFdaAnalogues(
        await fetchAnaloguesFromFDA(text),
        text
    ).filter((item) => (
        scoreFdaAnalogue(item, text) >= 70 && getFdaItemName(item) && buildEmbeddingText(item)
    ));

    let resolvedDrug = null;

    if (fdaAnalogues.length === 0) {
        const dailyMedDrug = await tryOfficialLookup(findDailyMedDrug, text);
        if (dailyMedDrug) {
            const savedDrug = await drugRepository.upsertInternationalDrug(dailyMedDrug);
            await searchCacheRepository.saveSearchResult(searchText, [savedDrug]);
            return [savedDrug];
        }

        const resolvedIngredient = await tryOfficialLookup(resolveIngredientFromPubChem, text);
        if (resolvedIngredient) {
            const ingredientLabels = await fetchAnaloguesFromFDA(resolvedIngredient.activeIngredient);
            const exactLabel = ingredientLabels.find((item) => (
                isExactIngredientLabel(item, resolvedIngredient.activeIngredient)
            ));
            const verifiedDrug = exactLabel ? null
                : await tryOfficialLookup(findDailyMedDrug, resolvedIngredient.activeIngredient);

            resolvedDrug = await drugRepository.upsertInternationalDrug({
                name: text.trim(),
                ...resolvedIngredient,
                ...(exactLabel || verifiedDrug ? {
                    verificationSource: exactLabel ? 'openFDA' : verifiedDrug.source,
                    verificationUrl: exactLabel
                        ? getFdaLabelUrl(exactLabel, resolvedIngredient.activeIngredient)
                        : verifiedDrug.sourceUrl
                } : {})
            });
            fdaAnalogues = rankFdaAnalogues(
                ingredientLabels.filter((item) => isExactIngredientLabel(item, resolvedIngredient.activeIngredient)),
                resolvedIngredient.activeIngredient
            );
        }
    }

    if (fdaAnalogues.length === 0) {
        if (resolvedDrug) {
            await searchCacheRepository.saveSearchResult(searchText, [resolvedDrug]);
            return [resolvedDrug];
        }
        await searchCacheRepository.saveSearchResult(
            searchText, [], DRUG_SEARCH_FALLBACK_CACHE_TTL_MS
        );
        return [];
    }

    const savedDrugs = [];

    for (const item of fdaAnalogues) {

        const name = item.openfda?.brand_name?.[0];

        const itemIngredient =
            item.openfda?.generic_name?.[0] ||
            text;

        if (!name) continue;

        const embeddingText =
            buildEmbeddingText(item);

        if (!embeddingText) continue;

        const existing = await drugRepository.getDrugByName(name);

        if (existing.length > 0) {

            let drugFromDb = existing[0];

            if (!hasReusableGuidelines(drugFromDb, embeddingText)) {
                const embedding = await createVector(embeddingText);

                drugFromDb =
                    await drugRepository.updateDrug(
                        drugFromDb._id,
                        {
                            activeIngredient:
                                itemIngredient ||
                                drugFromDb.activeIngredient,

                            guidelines: {
                                source: 'FDA',
                                sourceUrl: getFdaLabelUrl(item, itemIngredient),
                                originalText: embeddingText,
                                contentHash: createContentHash(embeddingText),
                                embedding
                            }
                        }
                    );

                if (!drugFromDb) {
                    throw new Error(`Drug not found after update: ${name}`);
                }
            }

            await indexFdaPassages(item, drugFromDb._id, drugFromDb.name);

            const isAlreadyInList =
                savedDrugs.some(
                    drug =>
                        drug._id.toString() ===
                        drugFromDb._id.toString()
                );

            if (!isAlreadyInList) savedDrugs.push(drugFromDb);
            continue;
        }

        const embedding = await createVector(embeddingText);

        const savedDrug =
            await drugRepository.createDrug({
                name,
                activeIngredient: itemIngredient,
                guidelines: {
                    source: 'FDA',
                    sourceUrl: getFdaLabelUrl(item, itemIngredient),
                    originalText: embeddingText,
                    contentHash: createContentHash(embeddingText),
                    embedding
                }
            });

        await indexFdaPassages(item, savedDrug._id, savedDrug.name);

        savedDrugs.push(savedDrug);
    }

    if (savedDrugs.length === 0) return resolvedDrug ? [resolvedDrug] : [];

    const results = mergeRankedDrugResults(
        resolvedDrug ? [resolvedDrug] : [],
        savedDrugs,
        text
    );
    await searchCacheRepository.saveSearchResult(searchText, results);
    return results;
};

export const searchDrugsBySymptom = async (symptom, drugIds) => {

    if (!symptom?.trim()) return {
        drugs: [],
        interactions: []
    };

    if (!Array.isArray(drugIds) || drugIds.length === 0) return {
        drugs: [],
        interactions: []
    };

    const vectorSymptom = await createVector(symptom.trim());

    const drugs = Array.isArray(vectorSymptom) && vectorSymptom.length > 0
        ? await drugRepository.getDrug(vectorSymptom, drugIds)
        : [];

    const interactions = await interactionRepository.searchInteractionsByText(symptom, drugIds);

    return {
        drugs,
        interactions
    };
};
