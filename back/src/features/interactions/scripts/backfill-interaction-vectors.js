import mongoose from 'mongoose';
import config from '../../../configuration/config.js';
import {backfillInteractionVectors} from '../services/interaction-vector-backfill.service.js';
import {INTERACTION_VECTOR_INDEX} from '../../../utils/constants.js';

const isDryRun = process.argv.includes('--dry-run');

try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.db);
    const {scanned, updated, indexMissing} = await backfillInteractionVectors({
        dryRun: isDryRun,
        onIndexCreated: () => console.log(`Created ${INTERACTION_VECTOR_INDEX}; Atlas may need time to make it queryable.`)
    });
    if (isDryRun && indexMissing) console.log(`Missing Atlas Vector Search index: ${INTERACTION_VECTOR_INDEX}`);
    console.log(`Scanned interactions: ${scanned}; ${isDryRun ? 'requiring updates' : 'updated'}: ${updated}`);
} catch (error) {
    console.error('Interaction vector backfill failed:', error);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
