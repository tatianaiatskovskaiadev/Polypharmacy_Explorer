import * as drugRepository from '../repository/drug.repository.js';
import * as interactionRepository from '../repository/interaction.repository.js';
import {createHash} from 'crypto';
import {createVector} from './ai.service.js';
import {fetchAnaloguesFromFDA} from './fda.service.js';
import {MAX_EMBEDDING_TEXT_LENGTH, MAX_FDA_SECTION_LENGTH} from '../utils/constants.js';

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

    const localDrugs = rankLocalDrugs(await drugRepository.getDrugByName(text), text);

    const searchIngredient = localDrugs[0]?.activeIngredient ?? text;

    const fdaAnalogues = rankFdaAnalogues(
        await fetchAnaloguesFromFDA(searchIngredient),
        text
    );

    if (fdaAnalogues.length === 0) return localDrugs;

    const savedDrugs = [];

    for (const item of fdaAnalogues) {

        const name = item.openfda?.brand_name?.[0];

        const itemIngredient =
            item.openfda?.generic_name?.[0] ||
            searchIngredient;

        if (!name) continue;

        const embeddingText =
            buildEmbeddingText(item);

        if (!embeddingText) continue;

        const existing = await drugRepository.getDrugByName(name);

        if (existing.length > 0) {

            let drugFromDb = existing[0];

            if (hasReusableGuidelines(drugFromDb, embeddingText)) {
                const isAlreadyInList =
                    savedDrugs.some(
                        drug =>
                            drug._id.toString() ===
                            drugFromDb._id.toString()
                    );
                if (!isAlreadyInList) {
                    savedDrugs.push(drugFromDb);
                }
                continue;
            }

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
                            originalText: embeddingText,
                            contentHash: createContentHash(embeddingText),
                            embedding
                        }
                    }
                );

            if (!drugFromDb) {
                throw new Error(`Drug not found after update: ${name}`);
            }

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
                    originalText: embeddingText,
                    contentHash: createContentHash(embeddingText),
                    embedding
                }
            });

        savedDrugs.push(savedDrug);
    }

    if (savedDrugs.length === 0) return localDrugs;

    const highConfidenceLocalDrugs = localDrugs.filter(
        (drug) => scoreLocalDrugMatch(drug, text) >= 80
    );

    return mergeRankedDrugResults(highConfidenceLocalDrugs, savedDrugs, text);
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
