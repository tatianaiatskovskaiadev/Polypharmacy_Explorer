import fs from 'fs';
import csv from "csv-parser";
import {insertDrugBatch} from '../repository/drug.repository.js';
import {ETL_BATCH_SIZE} from "../../../utils/constants.js";
import {normalizeDrugName} from '../utils/normalization.js';

// Streams the CSV so memory usage stays constant regardless of file size.
// Errors are propagated to the caller so a failed import is never reported as success.
export const parseDrugRegistry = async (filePath) => {
    let currentBatch = [];
    const namesInBatch = new Set();
    let totalRows = 0;
    let importedRows = 0;
    let skippedDuplicates = 0;

    const flushBatch = async () => {
        if (currentBatch.length === 0) return;
        const {insertedCount, duplicateCount} = await insertDrugBatch(currentBatch);
        importedRows += insertedCount;
        skippedDuplicates += duplicateCount;
        currentBatch = [];
        namesInBatch.clear();
        console.log(`[DB] Imported: ${importedRows}; duplicates skipped: ${skippedDuplicates}`);
    };

    const parser = fs.createReadStream(filePath).pipe(csv());

    for await (const row of parser) {

        const mappedRow = {
            name: row['drugname'],
            normalizedName: normalizeDrugName(row['drugname']),
            activeIngredient: row['activeingred'],
        }

        totalRows++;
        if (namesInBatch.has(mappedRow.normalizedName)) {
            skippedDuplicates++;
            continue;
        }
        namesInBatch.add(mappedRow.normalizedName);
        currentBatch.push(mappedRow);

        if (currentBatch.length === ETL_BATCH_SIZE) {
            await flushBatch();
        }
    }

    await flushBatch();

    return {totalRows, importedRows, skippedDuplicates};
}

