// Usage: npm run etl -- ./path/to/registry.csv
// Runs as a local CLI instead of an HTTP endpoint so that server files can never be read via the API.
import mongoose from "mongoose";
import config from "../configuration/config.js";
import {parseDrugRegistry} from "../services/etl.service.js";

const filePath = process.argv[2];
if (!filePath) {
    console.error('Usage: npm run etl -- <path-to-csv>');
    process.exit(1);
}

try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.db);
    console.time('Import time');
    const totalRows = await parseDrugRegistry(filePath);
    console.timeEnd('Import time');
    console.log(`Imported rows: ${totalRows}`);
} catch (error) {
    console.error('Import failed:', error);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
