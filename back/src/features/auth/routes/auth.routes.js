import {Router} from 'express';
import {
    confirmEmail, confirmPasswordReset, currentUser, forgotPassword, getActiveSessions,
    login, logout, register, resendConfirmationEmail, revokeActiveSession
} from '../controllers/auth.controller.js';
import {requireAuth, requireCsrf} from '../middlewares/auth.middleware.js';
import validate from '../../../middlewares/validation.middleware.js';

const router = Router();

router.post('/auth/register', validate('register'), register);
router.post('/auth/login', validate('login'), login);
router.get('/auth/me', requireAuth, currentUser);
router.post('/auth/logout', requireAuth, requireCsrf, logout);
router.post('/auth/verify', validate('verifyEmail'), confirmEmail);
router.post('/auth/resend-verification', requireAuth, requireCsrf, resendConfirmationEmail);
router.post('/auth/forgot-password', validate('forgotPassword'), forgotPassword);
router.post('/auth/reset-password', validate('resetPassword'), confirmPasswordReset);
router.get('/auth/sessions', requireAuth, getActiveSessions);
router.delete('/auth/sessions/:sessionId', requireAuth, requireCsrf, validate('revokeSession', 'params'), revokeActiveSession);

export default router;
