import * as drugRepository from '../repository/drug.repository.js';
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

    const localDrugs = await drugRepository.getDrugByName(text);

    const searchIngredient = localDrugs[0]?.activeIngredient ?? text;

    const fdaAnalogues =
        await fetchAnaloguesFromFDA(searchIngredient);

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

    return savedDrugs.length > 0 ? savedDrugs : localDrugs;
};

export const searchDrugsBySymptom = async (symptom, drugIds) => {

    if (!symptom?.trim()) return [];

    if (!Array.isArray(drugIds) || drugIds.length === 0) return [];

    const vectorSymptom = await createVector(symptom.trim());

    if (!Array.isArray(vectorSymptom) || vectorSymptom.length === 0) return [];

    return await drugRepository.getDrug(vectorSymptom, drugIds);
};
