import {Router} from 'express';
import {checkInteractions, syncInteraction} from '../controllers/interaction.controller.js';
import validate from '../middlewares/validation.middleware.js';

const router = Router();

router.post('/interactions/check', validate('checkInteractions'), checkInteractions);
router.post('/interactions/sync', validate('syncInteraction'), syncInteraction);

export default router;
