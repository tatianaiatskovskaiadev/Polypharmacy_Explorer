import config from "./config.js";
import {DEMO_API_KEY_HEADER} from "../utils/constants.js";

export const corsOptions = {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    origin: config.corsOrigins,
    allowedHeaders: ['Content-Type', 'Authorization', DEMO_API_KEY_HEADER],
    maxAge: 3600
}
