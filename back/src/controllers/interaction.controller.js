import * as interactionService from '../services/interaction.service.js';

export const checkInteractions = async (req, res) => {
    const result = await interactionService.checkInteraction(req.body.drugIds);
    return res.status(200).json(result);
}

export const syncInteraction = async (req, res) => {
    const {drugIdA, drugIdB, drugNameA, drugNameB} = req.body;
    const result = await interactionService.syncInteraction(drugIdA, drugIdB, drugNameA, drugNameB);
    return res.status(200).json(result ?? null);
}