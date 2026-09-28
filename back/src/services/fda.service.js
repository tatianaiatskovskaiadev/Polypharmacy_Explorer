import {ExternalServiceError} from "../utils/errors.js";

const FDA_LABEL_URL = 'https://api.fda.gov/drug/label.json';
const REQUEST_TIMEOUT_MS = 10_000;

const fetchLabels = async (search, limit) => {
    const url = `${FDA_LABEL_URL}?search=${encodeURIComponent(search)}&limit=${limit}`;

    const response = await fetch(url, {signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
    // openFDA responds 404 when nothing matches the query
    if (response.status === 404) return [];
    if (!response.ok) {
        const body = await response.text();

        console.error('openFDA error:', body);

        throw new ExternalServiceError(
            `openFDA responded with ${response.status} ${response.statusText}: ${body}`
        );
    }
    const data = await response.json();
    return data.results ?? [];
}

const quote = (value) => `"${value.replaceAll('"', '')}"`;

export const fetchRawInteraction = async (drugA, drugB) => {
    // Both terms must be scoped to the field, otherwise openFDA searches the second one across all fields
    const results = await fetchLabels(`drug_interactions:${quote(drugA)} AND drug_interactions:${quote(drugB)}`, 1);
    return results[0]?.drug_interactions?.[0] ?? null;
}

export const fetchAnaloguesFromFDA = async (activeIngredient) => {
    try {
        const ingredients = activeIngredient
            .split(';')
            .map(item => item.trim())
            .filter(Boolean);

        const results = await Promise.all(
            ingredients.map(ingredient =>
                fetchLabels(
                    `openfda.generic_name:${quote(ingredient)} OR openfda.brand_name:${quote(ingredient)}`,
                    5
                )
            )
        );

        return results.flat();
    } catch (error) {
        // Analogue search is best-effort: local results are still returned if FDA is unavailable
        console.error('Failed to fetch analogues from openFDA:', error);
        return [];
    }
}
