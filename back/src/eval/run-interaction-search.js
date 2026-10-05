import {readFile} from 'node:fs/promises';
import mongoose from 'mongoose';
import config from '../configuration/config.js';
import {createVector} from '../services/ai.service.js';
import {searchInteractionsByVector} from '../repository/interaction.repository.js';

const drugIds = (process.env.INTERACTION_EVAL_DRUG_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
if (drugIds.length < 3 || drugIds.some((id) => !mongoose.isValidObjectId(id))) {
    console.error('Set INTERACTION_EVAL_DRUG_IDS to at least three comma-separated MongoDB drug IDs.');
    process.exitCode = 1;
} else {
    try {
        const cases = JSON.parse(await readFile(new URL('../../evals/interaction-search-cases.json', import.meta.url), 'utf8'));
        await mongoose.connect(config.mongodb.uri, config.mongodb.db);

        for (const {query, expectedDescriptions} of cases) {
            const vector = await createVector(query);
            const results = await searchInteractionsByVector(vector, drugIds);
            const descriptions = results.map(({description}) => description.toLowerCase());
            const missing = expectedDescriptions.filter((expected) => !descriptions.some((actual) => actual.includes(expected)));
            const passed = missing.length === 0 && (expectedDescriptions.length > 0 || results.length === 0);
            console.log(`${passed ? 'PASS' : 'FAIL'} ${query}: ${results.length} interactions${missing.length ? `; missing ${missing.join(', ')}` : ''}`);
            if (!passed) process.exitCode = 1;
        }
    } catch (error) {
        console.error('Interaction search evaluation failed:', error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}
