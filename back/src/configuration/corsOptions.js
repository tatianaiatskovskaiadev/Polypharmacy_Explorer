import config from "./config.js";
import {CSRF_TOKEN_HEADER} from "../utils/constants.js";

export const corsOptions = {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    origin: config.corsOrigins,
    allowedHeaders: ['Content-Type', CSRF_TOKEN_HEADER],
    credentials: true,
    maxAge: 3600
}
