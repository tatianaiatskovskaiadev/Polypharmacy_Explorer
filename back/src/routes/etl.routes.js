import {Router} from 'express';
import {drugRegistry} from "../controllers/etl.controller.js";

const router = Router();

router.post('/api/etl/import-registry', drugRegistry);

export default router;