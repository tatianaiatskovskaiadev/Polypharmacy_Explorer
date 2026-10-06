import express from "express";
import cors from "cors";
import errorHandler from "./middlewares/error.middleware.js";
import {corsOptions} from "./configuration/corsOptions.js";
import drugRoutes from "./features/drugs/routes/drug.routes.js";
import interactionRoutes from "./features/interactions/routes/interaction.routes.js";
import ragRoutes from './features/ai/routes/rag.routes.js';
import agentRoutes from './features/ai/routes/agent.routes.js';
import authRoutes from './features/auth/routes/auth.routes.js';
import healthRoutes from './features/system/routes/health.routes.js';
import {protectAuthEndpoint, protectExpensiveEndpoint} from "./middlewares/cost-control.middleware.js";
import {requireAllowedOrigin, requireAuth, requireCsrf, requireVerifiedEmail} from './features/auth/middlewares/auth.middleware.js';
import {requestLogging} from './middlewares/request-logging.middleware.js';

const app = express();

const EXPENSIVE_ENDPOINTS = [
    '/',
    '/search',
    '/search/symptom',
    '/interactions/check',
    '/interactions/sync',
    '/rag/answer',
    '/agent/ask',
    '/agent/ask/stream'
];

app.use(requestLogging);
app.use(cors(corsOptions));

app.use(express.json({limit: '100kb'}));
app.use(requireAllowedOrigin);

app.use('/', healthRoutes);

app.post(['/auth/register', '/auth/login', '/auth/forgot-password', '/auth/reset-password', '/auth/resend-verification'], protectAuthEndpoint);
app.use('/', authRoutes);

app.post(EXPENSIVE_ENDPOINTS, requireAuth, requireVerifiedEmail, requireCsrf, protectExpensiveEndpoint);

app.use('/', drugRoutes);
app.use('/', interactionRoutes);
app.use('/', ragRoutes);
app.use('/', agentRoutes);

app.use((req, res) => res.status(404).type('text/plain; charset=utf-8').send('Not Found'));

app.use(errorHandler);

export default app;
