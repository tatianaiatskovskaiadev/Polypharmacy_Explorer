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
    registrationCode: process.env[ENV_VARS.registrationCode],
    appUrl: process.env[ENV_VARS.appUrl] || DEFAULT_CORS_ORIGIN,
    mail: {
        mode: process.env[ENV_VARS.mailMode] || 'console',
        host: process.env[ENV_VARS.smtpHost],
        port: Number(process.env[ENV_VARS.smtpPort] || 587),
        user: process.env[ENV_VARS.smtpUser],
        password: process.env[ENV_VARS.smtpPassword],
        from: process.env[ENV_VARS.smtpFrom]
    },
    mongodb: {
        uri: process.env[ENV_VARS.mongoUri],
        db: {
            dbName: process.env[ENV_VARS.dbName]
        }
    }
}

export const isLocalRuntime = () => {
    const nodeEnv = process.env[ENV_VARS.nodeEnv];
    return !nodeEnv || LOCAL_NODE_ENV_VALUES.includes(nodeEnv);
}

export const validateRuntimeConfig = () => {
    required(ENV_VARS.mongoUri);
    required(ENV_VARS.dbName);
    required(ENV_VARS.openAiApiKey);

    const mailMode = process.env[ENV_VARS.mailMode] || 'console';
    if (!['console', 'smtp'].includes(mailMode)) throw new Error('MAIL_MODE must be console or smtp');
    if (!isLocalRuntime() && mailMode !== 'smtp') throw new Error('MAIL_MODE must be smtp outside local runtime');
    if (mailMode === 'smtp') {
        for (const name of [ENV_VARS.smtpHost, ENV_VARS.smtpFrom]) required(name);
        const port = Number(process.env[ENV_VARS.smtpPort] || 587);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid port');
        if (Boolean(process.env[ENV_VARS.smtpUser]) !== Boolean(process.env[ENV_VARS.smtpPassword])) {
            throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together');
        }
    }
    if (!isLocalRuntime()) required(ENV_VARS.appUrl);
    const appUrl = new URL(process.env[ENV_VARS.appUrl] || DEFAULT_CORS_ORIGIN);
    if (!['http:', 'https:'].includes(appUrl.protocol) || (!isLocalRuntime() && appUrl.protocol !== 'https:')) {
        throw new Error('APP_URL must be an HTTPS URL outside local runtime');
    }
}

export default config;
