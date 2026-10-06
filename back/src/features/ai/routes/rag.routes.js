import {Router} from 'express';
import {answerQuestionWithEvidence} from '../controllers/rag.controller.js';
import validate from '../../../middlewares/validation.middleware.js';

const router = Router();

router.post('/rag/answer', validate('ragAnswer'), answerQuestionWithEvidence);

export default router;
