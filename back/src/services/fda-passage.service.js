import {createHash} from 'crypto';
import {createVectors} from './ai.service.js';
import * as passageRepository from '../repository/fda-passage.repository.js';
import {
    FDA_MAX_PASSAGES_PER_LABEL,
    FDA_PASSAGE_LENGTH,
    FDA_PASSAGE_OVERLAP,
    OPENAI_EMBEDDING_MODEL
} from '../utils/constants.js';

const SECTIONS = [
    'drug_interactions', 'contraindications', 'boxed_warning', 'warnings_and_cautions',
    'warnings', 'adverse_reactions', 'indications_and_usage', 'description'
];

const splitText = (text) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const chunks = [];
    let start = 0;
    while (start < normalized.length) {
        let end = Math.min(start + FDA_PASSAGE_LENGTH, normalized.length);
        if (end < normalized.length) {
            const boundary = normalized.lastIndexOf(' ', end);
            if (boundary > start + FDA_PASSAGE_LENGTH / 2) end = boundary;
        }
        chunks.push(normalized.slice(start, end));
        if (end === normalized.length) break;
        start = Math.max(start + 1, end - FDA_PASSAGE_OVERLAP);
    }
    return chunks;
};

export const buildFdaPassages = (item, drugId, drugName) => {
    if (!item.id) return [];
    const sourceUrl = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(`id:"${item.id}"`)}`;
    const passages = [];
    for (const section of SECTIONS) {
        for (const text of item[section] ?? []) {
            for (const chunk of splitText(text)) {
                if (passages.length >= FDA_MAX_PASSAGES_PER_LABEL) return passages;
                passages.push({
                    drugId,
                    drugName,
                    labelId: item.id,
                    sourceUrl,
                    section,
                    chunkIndex: passages.filter((passage) => passage.section === section).length,
                    text: chunk,
                    contentHash: createHash('sha256').update(chunk).digest('hex'),
                    embeddingModel: OPENAI_EMBEDDING_MODEL
                });
            }
        }
    }
    return passages;
};

export const indexFdaPassages = async (item, drugId, drugName) => {
    const passages = buildFdaPassages(item, drugId, drugName);
    if (passages.length === 0) return;
    const existing = await passageRepository.getPassagesByDrugId(drugId);
    const cached = new Map(existing.map((passage) => [
        `${passage.labelId}:${passage.section}:${passage.chunkIndex}`,
        passage
    ]));
    const missing = passages.filter((passage) => {
        const previous = cached.get(`${passage.labelId}:${passage.section}:${passage.chunkIndex}`);
        if (previous?.contentHash === passage.contentHash &&
            previous.embeddingModel === OPENAI_EMBEDDING_MODEL && previous.embedding?.length) {
            passage.embedding = previous.embedding;
            return false;
        }
        return true;
    });
    const vectors = missing.length > 0
        ? await createVectors(missing.map((passage) => passage.text))
        : [];
    if (vectors.length !== missing.length) throw new Error('Embedding count does not match FDA passage count');
    missing.forEach((passage, index) => { passage.embedding = vectors[index]; });
    await passageRepository.replacePassages(drugId, passages);
};
