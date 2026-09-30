export const normalizeDrugName = (name) => (
    String(name ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
);
