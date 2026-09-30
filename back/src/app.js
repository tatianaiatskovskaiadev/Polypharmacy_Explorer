import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import errorHandler from "./middlewares/error.middleware.js";
import {corsOptions} from "./configuration/corsOptions.js";
import drugRoutes from "./routes/drug.routes.js";
import interactionRoutes from "./routes/interaction.routes.js";
import {protectExpensiveEndpoint} from "./middlewares/cost-control.middleware.js";

const app = express();

const EXPENSIVE_ENDPOINTS = [
    '/',
    '/search',
    '/search/symptom',
    '/interactions/check',
    '/interactions/sync'
];

app.use(cors(corsOptions));

app.use(express.json({limit: '100kb'}));

app.get('/health', (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down'});
});

app.post(EXPENSIVE_ENDPOINTS, protectExpensiveEndpoint);

app.use('/', drugRoutes);
app.use('/', interactionRoutes);

app.use((req, res) => res.status(404).type('text/plain; charset=utf-8').send('Not Found'));

app.use(errorHandler);

export default app;
