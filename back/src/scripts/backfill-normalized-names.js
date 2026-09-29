// Usage: npm run backfill:normalized-names -- [--dry-run] [--skip-index]
// Backfills Drug.normalizedName before the unique index is relied on by the app.
import mongoose from "mongoose";
import config from "../configuration/config.js";
import {buildNormalizedNameBackfillPlan} from "../services/drug-normalization-migration.service.js";

const DRUGS_COLLECTION = 'drugs';
const NORMALIZED_NAME_INDEX = 'normalizedName_1';

const options = new Set(process.argv.slice(2));
const isDryRun = options.has('--dry-run');
const shouldSkipIndex = options.has('--skip-index');

const printDuplicates = (duplicates) => {
    console.error('Duplicate normalized drug names found. Resolve these records before creating the unique index:');

    for (const duplicate of duplicates) {
        console.error(`- ${duplicate.normalizedName}`);
        for (const item of duplicate.items) {
            console.error(`  ${item._id}: ${item.name}`);
        }
    }
};

try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.db);

    const drugs = await mongoose.connection
        .collection(DRUGS_COLLECTION)
        .find({}, {projection: {_id: 1, name: 1, normalizedName: 1}})
        .toArray();

    const {updates, duplicates} = buildNormalizedNameBackfillPlan(drugs);

    console.log(`Scanned drugs: ${drugs.length}`);
    console.log(`Documents requiring normalizedName update: ${updates.length}`);

    if (duplicates.length > 0) {
        printDuplicates(duplicates);
        process.exitCode = 1;
    } else if (isDryRun) {
        console.log('Dry run complete. No writes were applied.');
    } else {
        if (updates.length > 0) {
            await mongoose.connection.collection(DRUGS_COLLECTION).bulkWrite(
                updates.map((update) => ({
                    updateOne: {
                        filter: {_id: update._id},
                        update: {$set: {normalizedName: update.normalizedName}}
                    }
                })),
                {ordered: false}
            );
        }

        if (!shouldSkipIndex) {
            await mongoose.connection.collection(DRUGS_COLLECTION).createIndex(
                {normalizedName: 1},
                {unique: true, name: NORMALIZED_NAME_INDEX}
            );
        }

        console.log('normalizedName backfill completed successfully.');
    }
} catch (error) {
    console.error('normalizedName backfill failed:', error);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
