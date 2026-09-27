import express from "express";
import cors from "cors";
import errorHandler from "./middlewares/error.middleware.js";
import {corsOptions} from "./configuration/corsOptions.js";
import mongoose from "mongoose";
import config from "./configuration/config.js";
import drugRoutes from "./routes/drug.routes.js";
import interactionRoutes from "./routes/interaction.routes.js";

const app = express();

app.use(cors(corsOptions));

app.use(express.json({limit: '100kb'}));

app.get('/health', (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down'});
});

app.use('/', drugRoutes)
app.use('/', interactionRoutes)

app.use((req, res) => res.status(404).type('text/plain; charset=utf-8').send('Not Found'));

app.use(errorHandler);

async function startServer() {
    try {
        await mongoose.connect(config.mongodb.uri, config.mongodb.db);
        console.log('Connected to MongoDB');
    } catch (e) {
        console.error('Failed connection to MongoDB: ', e);
        process.exit(1);
    }
    app.listen(config.port, () => console.log(`Server running on port ${config.port}. Press Ctrl+C to stop.`));
}

startServer();