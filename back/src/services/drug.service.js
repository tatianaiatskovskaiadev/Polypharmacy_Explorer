import * as drugRepository from '../repository/drug.repository.js';
import {createVector} from './ai.service.js';
import {fetchAnaloguesFromFDA} from './fda.service.js';

export const createDrug = async (drug) => {
    const {name, activeIngredient, originalText} = drug;
    const embedding = await createVector(originalText);
    const data = {
        name,
        activeIngredient,
        guidelines: {
            originalText,
            embedding
        }
    }
    return await drugRepository.createDrug(data);
}

export const getSimilarDrugs = async (text) => {
    const localDrugs = await drugRepository.getDrugByName(text);

    const searchIngredient = localDrugs.length > 0 ? localDrugs[0].activeIngredient : text;

    const fdaAnalogues = await fetchAnaloguesFromFDA(searchIngredient);
    const savedDrugs = [];

    for (const item of fdaAnalogues) {
        const name = item.openfda?.brand_name?.[0];
        const itemIngredient = item.openfda?.generic_name?.[0] || searchIngredient;
        const originalText = item.warnings?.[0] || item.description?.[0] || 'No information available.';

        if (!name) continue;

        const existing = await drugRepository.getDrugByName(name);
        if (existing.length > 0) {
            const drugFromDb = existing[0];

            const isAlreadyInList = savedDrugs.some(d => d._id.toString() === drugFromDb._id.toString());
            if (!isAlreadyInList) {
                savedDrugs.push(drugFromDb);
            }
            continue;
        }

        console.log(`Vectorizing and saving new analogue: ${name}`);

        const embedding = await createVector(originalText);

        const savedDrug = await drugRepository.createDrug({
            name,
            activeIngredient: itemIngredient,
            guidelines: {
                originalText,
                embedding
            }
        });
        savedDrugs.push(savedDrug);
    }

    return savedDrugs;
}

export const searchDrugsBySymptom = async (symptom, drugIds) => {
    const vectorSymptom = await createVector(symptom);
    return await drugRepository.getDrug(vectorSymptom, drugIds);
}