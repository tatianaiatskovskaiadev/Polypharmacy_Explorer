import {isDatabaseConnected} from '../repository/health.repository.js';

export const getHealth = () => {
    const dbUp = isDatabaseConnected();
    return {statusCode: dbUp ? 200 : 503, body: {status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down'}};
};
