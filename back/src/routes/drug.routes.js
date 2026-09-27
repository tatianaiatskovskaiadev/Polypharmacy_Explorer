import {Router} from 'express';
import {
    createDrug, getDrugsBySymptom,
    getSimilarDrugs
} from '../controllers/drug.controller.js';

import validate from '../middlewares/validation.middleware.js';

const router = Router();

router.post('/', validate('createDrug'), createDrug);
router.post('/search', validate('searchDrugs'), getSimilarDrugs);
router.post('/search/symptom', validate('searchDrugsBySymptom'), getDrugsBySymptom);

export default router;