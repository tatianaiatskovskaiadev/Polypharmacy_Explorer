import config from "./config.js";

export const corsOptions = {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    origin: config.corsOrigins,
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600
}