import mongoose from "mongoose";
import config, {validateRuntimeConfig} from "./configuration/config.js";
import app from "./app.js";

async function startServer() {
    try {
        validateRuntimeConfig();
        await mongoose.connect(config.mongodb.uri, config.mongodb.db);
        console.log('Connected to MongoDB');
    } catch (e) {
        console.error('Failed connection to MongoDB: ', e);
        process.exit(1);
    }
    app.listen(config.port, () => console.log(`Server running on port ${config.port}. Press Ctrl+C to stop.`));
}

startServer();
