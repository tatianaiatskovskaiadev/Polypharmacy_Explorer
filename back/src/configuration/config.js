const required = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const config = {
    port: process.env.PORT || 3000,
    corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(o => o.trim()),
    mongodb: {
        uri: process.env.MONGO_URI,
        db: {
            dbName: process.env.DB_NAME
        }
    }
}

export const validateRuntimeConfig = () => {
    required('MONGO_URI');
    required('DB_NAME');
}

export default config;
