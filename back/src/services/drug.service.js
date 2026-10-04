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
import {runWithConcurrency} from '../utils/concurrency.js';
import {
    DRUG_ANALOGUE_SAVE_CONCURRENCY,
    DRUG_SEARCH_FALLBACK_CACHE_TTL_MS,
    MAX_FDA_ANALOGUES_PER_SEARCH,
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

const isCombinationLabel = (value) => splitIngredients(value).length > 1;

const normalizeIngredientBase = (value) => normalizeSearchText(value)
    .replace(/\s+(hydrochloride|hcl|hydrobromide|hbr)$/i, '');

const isExactIngredientLabel = (item, ingredient) => {
    const genericName = item.openfda?.generic_name?.[0] ?? '';
    return !isCombinationLabel(genericName) &&
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

const scoreLocalDrugMatch = (drug, searchText) => {
    const normalizedSearchText = normalizeSearchText(searchText);
    const normalizedName = normalizeSearchText(drug.name);
    const ingredients = splitIngredients(drug.activeIngredient);

    if (normalizedName === normalizedSearchText) return 100;
    if (isCombinationLabel(drug.name) || ingredients.length > 1) return 0;
    if (ingredients.includes(normalizedSearchText)) {
        return 90;
    }
    if (ingredients[0]?.includes(normalizedSearchText)) return 80;
    if (normalizedName.startsWith(normalizedSearchText)) return 70;
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
    const isCombination = isCombinationLabel(normalizedIngredient);

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

const searchEvidenceScore = (drug) => (
    Number(Boolean(drug.guidelines?.contentHash)) * 4 +
    Number(Boolean(drug.guidelines?.sourceUrl)) * 2 +
    Number(Boolean(drug.guidelines?.verificationUrl))
);

const mergeRankedDrugResults = (primaryDrugs, secondaryDrugs, searchText) => {
    const byNormalizedName = new Map();

    for (const drug of [...primaryDrugs, ...secondaryDrugs]) {
        const key = normalizeSearchText(drug.name);
        if (!key) continue;
        const existing = byNormalizedName.get(key);
        if (!existing || searchEvidenceScore(drug) > searchEvidenceScore(existing) ||
            (searchEvidenceScore(drug) === searchEvidenceScore(existing) &&
                String(drug._id) < String(existing._id))) {
            byNormalizedName.set(key, drug);
        }
    }

    return rankLocalDrugs([...byNormalizedName.values()], searchText);
};

const buildGuidelines = (originalText, embedding, source, sourceUrl) => ({
    source,
    ...(sourceUrl ? {sourceUrl} : {}),
    originalText,
    contentHash: originalText ? createContentHash(originalText) : undefined,
    embedding
});

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
        guidelines: buildGuidelines(originalText, embedding, 'Manual')
    };

    return await drugRepository.createDrug(data);
};

const findInCache = async (searchText, text) => {
    const cachedIds = await searchCacheRepository.getCachedDrugIds(searchText);
    if (Array.isArray(cachedIds)) {
        if (cachedIds.length === 0) return [];
        const cachedDrugs = await drugRepository.getDrugsByIds(cachedIds, {searchSummary: true});
        if (cachedDrugs.length === cachedIds.length) {
            return mergeRankedDrugResults([], cachedDrugs, text);
        }
    }
    return null;
};

const findInLocalDb = async (text) => mergeRankedDrugResults([], (
    await drugRepository.getDrugByName(text, {searchSummary: true})
).filter((drug) => scoreLocalDrugMatch(drug, text) >= 70), text);

const resolveAndSaveOfficialSources = async (text, localDrugs) => {
    let fdaAnalogues = rankFdaAnalogues(
        await fetchAnaloguesFromFDA(text),
        text
    ).filter((item) => (
        scoreFdaAnalogue(item, text) >= 70 && getFdaItemName(item) && buildEmbeddingText(item)
    ));

    let resolvedDrug = null;

    if (fdaAnalogues.length === 0) {
        if (localDrugs.length > 0) {
            return {
                directResults: localDrugs, ttl: DRUG_SEARCH_FALLBACK_CACHE_TTL_MS
            };
        }
        const dailyMedDrug = await tryOfficialLookup(findDailyMedDrug, text);
        if (dailyMedDrug) {
            const savedDrug = await drugRepository.upsertInternationalDrug(dailyMedDrug);
            return {directResults: [savedDrug]};
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

    return {fdaAnalogues, resolvedDrug};
};

const saveFdaAnalogue = async (item, text) => {
    const name = getFdaItemName(item);
    const itemIngredient = getFdaItemIngredient(item) || text;
    const embeddingText = buildEmbeddingText(item);
    if (!name || !embeddingText) return null;

    const existing = (await drugRepository.getDrugByName(name)).filter((drug) => (
        normalizeSearchText(drug.name) === normalizeSearchText(name)
    ));

    if (existing.length > 0) {
        let drugFromDb = mergeRankedDrugResults([], existing, name)[0];

        if (!hasReusableGuidelines(drugFromDb, embeddingText)) {
            const embedding = await createVector(embeddingText);
            drugFromDb = await drugRepository.updateDrug(drugFromDb._id, {
                activeIngredient: itemIngredient || drugFromDb.activeIngredient,
                guidelines: buildGuidelines(embeddingText, embedding, 'FDA', getFdaLabelUrl(item, itemIngredient))
            });

            if (!drugFromDb) throw new Error(`Drug not found after update: ${name}`);
        }

        await indexFdaPassages(item, drugFromDb._id, drugFromDb.name);
        return drugFromDb;
    }

    const embedding = await createVector(embeddingText);
    let savedDrug = await drugRepository.upsertFdaAnalogue({
        name,
        activeIngredient: itemIngredient,
        guidelines: buildGuidelines(embeddingText, embedding, 'FDA', getFdaLabelUrl(item, itemIngredient))
    });

    if (!hasReusableGuidelines(savedDrug, embeddingText)) {
        savedDrug = await drugRepository.updateDrug(savedDrug._id, {
            activeIngredient: itemIngredient,
            guidelines: buildGuidelines(embeddingText, embedding, 'FDA', getFdaLabelUrl(item, itemIngredient))
        });
        if (!savedDrug) throw new Error(`Drug not found after update: ${name}`);
    }

    await indexFdaPassages(item, savedDrug._id, savedDrug.name);
    return savedDrug;
};

export const getSimilarDrugsWithStatus = async (text) => {
    const searchText = normalizeSearchText(text);
    const cachedDrugs = await findInCache(searchText, text);
    if (cachedDrugs !== null) return {drugs: cachedDrugs, partial: false};

    const localDrugs = await findInLocalDb(text);
    const {fdaAnalogues, resolvedDrug, directResults, ttl} =
        await resolveAndSaveOfficialSources(text, localDrugs);
    if (directResults !== undefined) {
        await searchCacheRepository.saveSearchResult(
            searchText, directResults, ttl ?? undefined
        );
        return {drugs: directResults, partial: false};
    }

    if (fdaAnalogues.length === 0) {
        if (resolvedDrug) {
            await searchCacheRepository.saveSearchResult(searchText, [resolvedDrug]);
            return {drugs: [resolvedDrug], partial: false};
        }
        await searchCacheRepository.saveSearchResult(
            searchText, [], DRUG_SEARCH_FALLBACK_CACHE_TTL_MS
        );
        return {drugs: [], partial: false};
    }

    const uniqueAnalogues = new Map();
    for (const item of fdaAnalogues) {
        const name = normalizeSearchText(getFdaItemName(item));
        if (!name || !buildEmbeddingText(item) || uniqueAnalogues.has(name)) continue;
        uniqueAnalogues.set(name, item);
        if (uniqueAnalogues.size >= MAX_FDA_ANALOGUES_PER_SEARCH) break;
    }

    const savedDrugs = [];
    const analogueResults = await runWithConcurrency(
        [...uniqueAnalogues.values()], DRUG_ANALOGUE_SAVE_CONCURRENCY,
        async (item) => {
            try {
                return {drug: await saveFdaAnalogue(item, text)};
            } catch (error) {
                if (!(error instanceof ExternalServiceError)) throw error;
                console.error('FDA analogue enrichment failed:', error);
                return {error};
            }
        }
    );
    const failedAnalogues = analogueResults.filter((result) => result.error);
    for (const {drug: savedDrug} of analogueResults) {
        if (savedDrug && !savedDrugs.some((drug) => String(drug._id) === String(savedDrug._id))) {
            savedDrugs.push(savedDrug);
        }
    }

    const results = mergeRankedDrugResults(
        [...localDrugs, ...(resolvedDrug ? [resolvedDrug] : [])],
        savedDrugs,
        text
    );
    if (failedAnalogues.length > 0 && results.length === 0) throw failedAnalogues[0].error;
    if (failedAnalogues.length === 0) {
        await searchCacheRepository.saveSearchResult(searchText, results);
    }
    return {drugs: results, partial: failedAnalogues.length > 0};
};

export const getSimilarDrugs = async (text) => (await getSimilarDrugsWithStatus(text)).drugs;

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
