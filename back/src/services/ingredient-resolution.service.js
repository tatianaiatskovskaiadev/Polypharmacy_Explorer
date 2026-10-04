import {ExternalServiceError} from '../utils/errors.js';

const PUBCHEM_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name';
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{2,79}$/u;

export const resolveIngredientFromPubChem = async (name) => {
    const query = String(name ?? '').trim();
    if (!NAME_PATTERN.test(query)) return null;

    const url = `${PUBCHEM_URL}/${encodeURIComponent(query)}/synonyms/JSON`;
    let response;
    try {
        response = await fetch(url, {signal: AbortSignal.timeout(10_000)});
    } catch (error) {
        throw new ExternalServiceError(`PubChem request failed: ${error.message}`);
    }

    if (response.status === 404) return null;
    if (!response.ok) {
        throw new ExternalServiceError(`PubChem responded with ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const match = data.InformationList?.Information?.find((item) => (
        Number.isInteger(item.CID) &&
        item.Synonym?.some((synonym) => synonym.toLowerCase() === query.toLowerCase())
    ));
    if (!match) return null;

    const activeIngredient = match.Synonym[0]
        ?.replace(/\s+(?:hydrochloride|hcl|hydrobromide|hbr)$/i, '')
        .trim();
    if (!activeIngredient || !NAME_PATTERN.test(activeIngredient)) {
        return null;
    }

    return {
        activeIngredient,
        source: 'PubChem (NIH)',
        sourceUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${match.CID}`
    };
};
