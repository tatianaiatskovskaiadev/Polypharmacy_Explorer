export const logEvent = (level, event, fields = {}) => {
    const entry = {timestamp: new Date().toISOString(), level, event, ...fields};
    console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
};
