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
        uri: required('MONGO_URI'),
        db: {
            dbName: required('DB_NAME')
        }
    }
}

export default config;