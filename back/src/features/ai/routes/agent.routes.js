import {Router} from 'express';
import {askSelectedDrugAgent, streamSelectedDrugAgent} from '../controllers/agent.controller.js';
import validate from '../../../middlewares/validation.middleware.js';

const router = Router();

router.post('/agent/ask', validate('agentAsk'), askSelectedDrugAgent);
router.post('/agent/ask/stream', validate('agentAsk'), streamSelectedDrugAgent);

export default router;
