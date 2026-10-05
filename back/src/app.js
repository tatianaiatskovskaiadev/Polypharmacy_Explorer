import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import errorHandler from "./middlewares/error.middleware.js";
import {corsOptions} from "./configuration/corsOptions.js";
import drugRoutes from "./routes/drug.routes.js";
import interactionRoutes from "./routes/interaction.routes.js";
import ragRoutes from './routes/rag.routes.js';
import agentRoutes from './routes/agent.routes.js';
import authRoutes from './routes/auth.routes.js';
import {protectAuthEndpoint, protectExpensiveEndpoint} from "./middlewares/cost-control.middleware.js";
import {requireAllowedOrigin, requireAuth, requireCsrf, requireVerifiedEmail} from './middlewares/auth.middleware.js';
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

app.get('/health', (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down'});
});

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
