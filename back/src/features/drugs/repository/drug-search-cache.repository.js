import {DrugSearchCache} from '../models/DrugSearchCache.model.js';
import {DRUG_SEARCH_CACHE_TTL_MS, DRUG_SEARCH_VERSION} from '../../../utils/constants.js';

export const getCachedDrugIds = async (query) => {
    const cached = await DrugSearchCache.findOne({
        query,
        searchVersion: DRUG_SEARCH_VERSION,
        expiresAt: {$gt: new Date()}
    }).lean();
    return cached?.drugIds.map(String) ?? null;
};

export const saveSearchResult = async (query, drugs, ttlMs = DRUG_SEARCH_CACHE_TTL_MS) => {
    await DrugSearchCache.findOneAndUpdate(
        {query},
        {$set: {
            drugIds: drugs.map((drug) => drug._id),
            searchVersion: DRUG_SEARCH_VERSION,
            expiresAt: new Date(Date.now() + ttlMs)
        }},
        {upsert: true}
    );
};
