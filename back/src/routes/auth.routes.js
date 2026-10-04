import {Router} from 'express';
import {currentUser, login, logout, register} from '../controllers/auth.controller.js';
import {requireAuth, requireCsrf} from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validation.middleware.js';

const router = Router();

router.post('/auth/register', validate('register'), register);
router.post('/auth/login', validate('login'), login);
router.get('/auth/me', requireAuth, currentUser);
router.post('/auth/logout', requireAuth, requireCsrf, logout);

export default router;
