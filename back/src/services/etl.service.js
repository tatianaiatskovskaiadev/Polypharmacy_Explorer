import fs from 'fs';
import csv from "csv-parser";
import {Drug} from "../models/Drug.model.js";
import {ETL_BATCH_SIZE} from "../utils/constants.js";

// Streams the CSV so memory usage stays constant regardless of file size.
// Errors are propagated to the caller so a failed import is never reported as success.
export const parseDrugRegistry = async (filePath) => {
    let currentBatch = [];
    let totalRows = 0;

    const parser = fs.createReadStream(filePath).pipe(csv());

    for await (const row of parser) {

        const mappedRow = {
            name: row['drugname'],
            activeIngredient: row['activeingred'],
        }

        currentBatch.push(mappedRow);
        totalRows++;

        if (currentBatch.length === ETL_BATCH_SIZE) {
            await Drug.insertMany(currentBatch, { ordered: false });
            console.log(`[DB] Rows saved: ${totalRows}`);
            currentBatch = [];
        }
    }

    if (currentBatch.length > 0) {
        await Drug.insertMany(currentBatch, { ordered: false });
    }

    return totalRows;
}

