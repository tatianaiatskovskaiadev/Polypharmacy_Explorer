import {getHealth} from '../services/health.service.js';

export const checkHealth = (req, res) => {
    const {statusCode, body} = getHealth();
    return res.status(statusCode).json(body);
};
