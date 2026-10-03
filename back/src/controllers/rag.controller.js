import {answerQuestion} from '../services/rag.service.js';

export const answerQuestionWithEvidence = async (req, res) => {
    const {question, drugIds} = req.body;
    const result = await answerQuestion(question, drugIds);
    return res.status(200).json(result);
};
