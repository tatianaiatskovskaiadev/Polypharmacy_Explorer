import {askAgent} from '../services/agent.service.js';

export const askSelectedDrugAgent = async (req, res) => {
    const {question, drugIds} = req.body;
    return res.status(200).json(await askAgent(question, drugIds));
};
