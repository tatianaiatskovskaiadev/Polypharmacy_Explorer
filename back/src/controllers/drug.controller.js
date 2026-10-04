import * as drugService from "../services/drug.service.js";

export const createDrug = async (req, res) => {
    const data = await drugService.createDrug(req.body);
    return res.status(201).json(data);
}

export const getSimilarDrugs = async (req, res) => {
    const data = await drugService.getSimilarDrugs(req.body.text);
    return res.status(200).json(data.map((drug) => ({
        _id: drug._id,
        name: drug.name,
        activeIngredient: drug.activeIngredient,
        guidelines: {
            source: drug.guidelines?.source ?? 'FDA',
            sourceUrl: drug.guidelines?.sourceUrl,
            verificationSource: drug.guidelines?.verificationSource,
            verificationUrl: drug.guidelines?.verificationUrl
        }
    })));
}

export const getDrugsBySymptom = async (req, res) => {
    const {text, drugIds} = req.body;
    const data = await drugService.searchDrugsBySymptom(text, drugIds);
    return res.status(200).json(data);
};
