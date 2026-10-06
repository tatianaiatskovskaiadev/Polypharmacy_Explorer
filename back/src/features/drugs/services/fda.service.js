import {ExternalServiceError} from "../../../utils/errors.js";
import {
    FDA_LABEL_URL,
    FDA_MAX_RETRIES,
    FDA_REQUEST_TIMEOUT_MS,
    FDA_RETRY_BACKOFF_MS
} from "../../../utils/constants.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitResponse = (response, body) => (
    response.status === 429 ||
    body.toLowerCase().includes('too many requests')
);

const fetchWithRetry = async (url) => {
    for (let attempt = 0; attempt <= FDA_MAX_RETRIES; attempt++) {
        let response;
        try {
            response = await fetch(url, {signal: AbortSignal.timeout(FDA_REQUEST_TIMEOUT_MS)});
        } catch (error) {
            if (attempt < FDA_MAX_RETRIES) {
                await delay(FDA_RETRY_BACKOFF_MS * (attempt + 1));
                continue;
            }

            throw new ExternalServiceError(`openFDA request failed: ${error.message}`);
        }

        if (response.status === 404) {
            return [];
        }

        if (response.ok) {
            const data = await response.json();
            return data.results ?? [];
        }

        const body = await response.text();
        if (isRateLimitResponse(response, body) && attempt < FDA_MAX_RETRIES) {
            await delay(FDA_RETRY_BACKOFF_MS * (attempt + 1));
            continue;
        }

        throw new ExternalServiceError(
            `openFDA responded with ${response.status} ${response.statusText}`
        );
    }

    throw new ExternalServiceError('openFDA request failed');
};

const fetchLabels = async (search, limit) => {
    const url = `${FDA_LABEL_URL}?search=${encodeURIComponent(search)}&limit=${limit}`;

    return await fetchWithRetry(url);
}

const quote = (value) => `"${value.replaceAll('"', '')}"`;

const simplifyInteractionTerm = (value) => (
    value
        .replace(/\b(HYDROCHLORIDE|SODIUM|CALCIUM|POTASSIUM|PHOSPHATE|HBR|HCL)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
);

const getInteractionSearchTerms = (value) => (
    [...new Set([
        value,
        simplifyInteractionTerm(value)
    ].filter(Boolean))]
);

const fetchDirectionalInteraction = async (labelDrug, interactingDrug) => {
    for (const interactionTerm of getInteractionSearchTerms(interactingDrug)) {
        const results = await fetchLabels(
            `openfda.generic_name:${quote(labelDrug)} AND drug_interactions:${quote(interactionTerm)}`,
            1
        );

        const label = results[0];
        const interactionText = label?.drug_interactions?.[0];
        if (interactionText) {
            return {
                text: interactionText,
                source: 'openFDA',
                sourceUrl: `${FDA_LABEL_URL}?search=${encodeURIComponent(
                    label.id ? `id:${label.id}` : `openfda.generic_name:${quote(labelDrug)}`
                )}`
            };
        }
    }

    return null;
};

export const fetchInteractionFromFDA = async (drugA, drugB) => {
    return await fetchDirectionalInteraction(drugA, drugB)
        ?? await fetchDirectionalInteraction(drugB, drugA);
}

export const fetchRawInteraction = async (drugA, drugB) => (
    (await fetchInteractionFromFDA(drugA, drugB))?.text ?? null
);

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
                    100
                )
            )
        );

        return results.flat();
    } catch (error) {
        console.error('Failed to fetch analogues from openFDA:', error);
        return [];
    }
}
