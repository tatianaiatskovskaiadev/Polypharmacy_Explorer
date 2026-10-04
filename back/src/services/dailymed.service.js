import {ExternalServiceError} from '../utils/errors.js';

const BASE_URL = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';
const REQUEST_TIMEOUT_MS = 10_000;
const LABEL_LIMIT = 3;
const SETID_PATTERN = /^[0-9a-f-]{36}$/i;
const getLabelUrl = (setid) => `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`;

const fetchDocument = async (url, format) => {
    let response;
    try {
        response = await fetch(url, {signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
    } catch (error) {
        throw new ExternalServiceError(`DailyMed request failed: ${error.message}`);
    }

    if (response.status === 404) return null;
    if (!response.ok) {
        throw new ExternalServiceError(`DailyMed responded with ${response.status} ${response.statusText}`);
    }

    return format === 'json' ? response.json() : response.text();
};

const getLabels = async (name, nameType = 'generic') => {
    const url = new URL(`${BASE_URL}/spls.json`);
    url.searchParams.set('drug_name', name);
    url.searchParams.set('name_type', nameType);
    url.searchParams.set('pagesize', String(LABEL_LIMIT));
    const result = await fetchDocument(url, 'json');
    return result?.data ?? [];
};

const decodeXmlText = (xml) => xml
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"
    })[entity])
    .replace(/\s+/g, ' ')
    .trim();

export const extractInteractionSection = (xml) => {
    const sectionCode = /<code\b[^>]*\bcode="34073-7"[^>]*\/?>/i.exec(xml);
    if (!sectionCode) return null;

    const section = xml.slice(sectionCode.index + sectionCode[0].length)
        .replace(/^([\s\S]*?)<\/excerpt>/i, '');
    const text = /<text(?:\s[^>]*)?>([\s\S]*?)<\/text>/i.exec(section)?.[1];
    return text ? decodeXmlText(text) : null;
};

const containsDrugName = (text, name) => {
    const normalizedName = name.trim().replace(/\b(hydrochloride|sodium|calcium|potassium|phosphate|hbr|hcl)\b/gi, '').trim();
    if (!normalizedName) return false;
    const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(text);
};

const getLabelXml = async (setid) => {
    if (!SETID_PATTERN.test(setid)) return null;
    return fetchDocument(`${BASE_URL}/spls/${setid}.xml`, 'xml');
};

export const findDailyMedDrug = async (name) => {
    const labels = await getLabels(name);
    const matchingLabel = labels.find((label) => {
        const title = label.title?.toLowerCase() ?? '';
        const searchName = name.trim().toLowerCase();
        return SETID_PATTERN.test(label.setid) && (
            title === searchName || title.startsWith(`${searchName} `) || title.startsWith(`${searchName} (`)
        );
    });
    if (!matchingLabel) {
        const brandLabels = await getLabels(name, 'brand');
        let brandMatch = null;
        for (const label of brandLabels) {
            const titleMatch = /^(.+?)\s+\(([^)]+)\)/.exec(label.title ?? '');
            if (SETID_PATTERN.test(label.setid) &&
                titleMatch?.[1].toLowerCase() === name.trim().toLowerCase() &&
                /^[a-z ,/-]{3,120}$/i.test(titleMatch[2])) {
                brandMatch = {setid: label.setid, activeIngredient: titleMatch[2]};
                break;
            }
        }
        if (!brandMatch) return null;

        return {
            name: name.trim(),
            activeIngredient: brandMatch.activeIngredient,
            source: 'DailyMed (NLM)',
            sourceUrl: getLabelUrl(brandMatch.setid)
        };
    }

    return {
        name: name.trim(),
        activeIngredient: name.trim(),
        source: 'DailyMed (NLM)',
        sourceUrl: getLabelUrl(matchingLabel.setid)
    };
};

export const fetchInteractionFromDailyMed = async (drugA, drugB) => {
    for (const [labelDrug, interactingDrug] of [[drugA, drugB], [drugB, drugA]]) {
        const labels = await getLabels(labelDrug);
        for (const label of labels) {
            const xml = await getLabelXml(label.setid);
            const text = xml && extractInteractionSection(xml);
            if (text && containsDrugName(text, interactingDrug)) {
                return {
                    text,
                    source: 'DailyMed (NLM)',
                    sourceUrl: getLabelUrl(label.setid)
                };
            }
        }
    }
    return null;
};
