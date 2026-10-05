import mongoose from 'mongoose';
import config from '../configuration/config.js';
import {createVector} from '../services/ai.service.js';
import {buildInteractionSearchText, needsInteractionEmbedding} from '../services/interaction-search.service.js';
import {OPENAI_EMBEDDING_MODEL} from '../utils/constants.js';

const isDryRun = process.argv.includes('--dry-run');
let scanned = 0;
let updated = 0;

try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.db);
    const interactions = mongoose.connection.collection('interactions');
    const cursor = interactions.find({}, {
        projection: {description: 1, actionRequired: 1, riskLevel: 1, searchText: 1, embedding: 1, embeddingModel: 1}
    });

    for await (const interaction of cursor) {
        scanned++;
        if (!needsInteractionEmbedding(interaction)) continue;
        if (isDryRun) {
            updated++;
            continue;
        }

        const searchText = buildInteractionSearchText(interaction);
        const embedding = await createVector(searchText);
        const result = await interactions.updateOne(
            {
                _id: interaction._id,
                description: interaction.description,
                actionRequired: interaction.actionRequired,
                riskLevel: interaction.riskLevel
            },
            {$set: {searchText, embedding, embeddingModel: OPENAI_EMBEDDING_MODEL}}
        );
        updated += result.modifiedCount;
    }

    console.log(`Scanned interactions: ${scanned}; ${isDryRun ? 'requiring updates' : 'updated'}: ${updated}`);
} catch (error) {
    console.error('Interaction vector backfill failed:', error);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
