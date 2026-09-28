import {DEFAULT_CORS_ORIGIN, DEFAULT_PORT, ENV_VARS} from "../utils/constants.js";

const required = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const config = {
    port: process.env[ENV_VARS.port] || DEFAULT_PORT,
    corsOrigins: (process.env[ENV_VARS.corsOrigin] || DEFAULT_CORS_ORIGIN).split(',').map(o => o.trim()),
    demoApiKey: process.env[ENV_VARS.demoApiKey],
    mongodb: {
        uri: process.env[ENV_VARS.mongoUri],
        db: {
            dbName: process.env[ENV_VARS.dbName]
        }
    }
}

export const validateRuntimeConfig = () => {
    required(ENV_VARS.mongoUri);
    required(ENV_VARS.dbName);
}

export default config;
