import {Router} from 'express';
import {
    createDrug, getDrugsBySymptom,
    getSimilarDrugs
} from '../controllers/drug.controller.js';

import validate from '../middlewares/validation.middleware.js';
import {protectExpensiveEndpoint} from '../middlewares/cost-control.middleware.js';

const router = Router();

router.post('/', protectExpensiveEndpoint, validate('createDrug'), createDrug);
router.post('/search', protectExpensiveEndpoint, validate('searchDrugs'), getSimilarDrugs);
router.post('/search/symptom', protectExpensiveEndpoint, validate('searchDrugsBySymptom'), getDrugsBySymptom);

export default router;
