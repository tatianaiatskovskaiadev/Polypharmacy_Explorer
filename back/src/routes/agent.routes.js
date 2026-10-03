import {Router} from 'express';
import {askSelectedDrugAgent} from '../controllers/agent.controller.js';
import validate from '../middlewares/validation.middleware.js';

const router = Router();

router.post('/agent/ask', validate('agentAsk'), askSelectedDrugAgent);

export default router;
