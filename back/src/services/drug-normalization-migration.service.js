import {normalizeDrugName} from "../utils/normalization.js";

export const buildNormalizedNameBackfillPlan = (drugs) => {
    const updates = [];
    const byNormalizedName = new Map();

    for (const drug of drugs) {
        const normalizedName = normalizeDrugName(drug.name);
        if (!normalizedName) continue;

        const existing = byNormalizedName.get(normalizedName) ?? [];
        existing.push({
            _id: String(drug._id),
            name: drug.name
        });
        byNormalizedName.set(normalizedName, existing);

        if (drug.normalizedName !== normalizedName) {
            updates.push({
                _id: drug._id,
                name: drug.name,
                normalizedName
            });
        }
    }

    const duplicates = [...byNormalizedName.entries()]
        .filter(([, items]) => items.length > 1)
        .map(([normalizedName, items]) => ({
            normalizedName,
            items
        }));

    return {
        updates,
        duplicates
    };
};
