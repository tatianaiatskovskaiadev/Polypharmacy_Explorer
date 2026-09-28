import {Router} from 'express';
import {checkInteractions, syncInteraction} from '../controllers/interaction.controller.js';
import validate from '../middlewares/validation.middleware.js';
import {protectExpensiveEndpoint} from '../middlewares/cost-control.middleware.js';

const router = Router();

router.post('/interactions/check', protectExpensiveEndpoint, validate('checkInteractions'), checkInteractions);
router.post('/interactions/sync', protectExpensiveEndpoint, validate('syncInteraction'), syncInteraction);

export default router;
