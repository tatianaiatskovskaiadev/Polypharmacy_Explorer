import {
    DEFAULT_CORS_ORIGIN,
    DEFAULT_PORT,
    ENV_VARS,
    LOCAL_NODE_ENV_VALUES
} from "../utils/constants.js";

const required = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const config = {
    port: process.env[ENV_VARS.port] || DEFAULT_PORT,
    nodeEnv: process.env[ENV_VARS.nodeEnv],
    corsOrigins: (process.env[ENV_VARS.corsOrigin] || DEFAULT_CORS_ORIGIN).split(',').map(o => o.trim()),
    demoApiKey: process.env[ENV_VARS.demoApiKey],
    mongodb: {
        uri: process.env[ENV_VARS.mongoUri],
        db: {
            dbName: process.env[ENV_VARS.dbName]
        }
    }
}

const isLocalRuntime = () => {
    const nodeEnv = process.env[ENV_VARS.nodeEnv];
    return !nodeEnv || LOCAL_NODE_ENV_VALUES.includes(nodeEnv);
}

export const validateRuntimeConfig = () => {
    required(ENV_VARS.mongoUri);
    required(ENV_VARS.dbName);
    required(ENV_VARS.openAiApiKey);

    if (!process.env[ENV_VARS.demoApiKey]) {
        if (!isLocalRuntime()) {
            throw new Error(`Missing required environment variable outside local runtime: ${ENV_VARS.demoApiKey}`);
        }

        console.warn(`${ENV_VARS.demoApiKey} is not set. Expensive demo endpoints are not API-key gated in local runtime.`);
    }
}

export default config;
