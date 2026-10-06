// Usage: npm run backfill:normalized-names -- [--dry-run] [--skip-index]
// Backfills Drug.normalizedName before the unique index is relied on by the app.
import mongoose from "mongoose";
import config from "../../../configuration/config.js";
import {backfillNormalizedNames} from '../services/normalized-name-backfill.service.js';

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

    const {scanned, updateCount, duplicates} = await backfillNormalizedNames({
        dryRun: isDryRun, skipIndex: shouldSkipIndex
    });

    console.log(`Scanned drugs: ${scanned}`);
    console.log(`Documents requiring normalizedName update: ${updateCount}`);

    if (duplicates.length > 0) {
        printDuplicates(duplicates);
        process.exitCode = 1;
    } else if (isDryRun) {
        console.log('Dry run complete. No writes were applied.');
    } else {
        console.log('normalizedName backfill completed successfully.');
    }
} catch (error) {
    console.error('normalizedName backfill failed:', error);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
