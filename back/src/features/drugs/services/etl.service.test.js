import {beforeEach, expect, jest, test} from '@jest/globals';
import {randomUUID} from 'crypto';
import {writeFile, rm} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';

const insertMany = jest.fn();
const constants = await import('../../../utils/constants.js');
jest.unstable_mockModule('../models/Drug.model.js', () => ({Drug: {insertMany}}));
jest.unstable_mockModule('../../../utils/constants.js', () => ({...constants, ETL_BATCH_SIZE: 2}));

const {parseDrugRegistry} = await import('./etl.service.js');

const importCsv = async (rows) => {
    const filePath = join(tmpdir(), `polypharmacy-etl-${randomUUID()}.csv`);
    try {
        await writeFile(filePath, `drugname,activeingred\n${rows.join('\n')}\n`);
        return await parseDrugRegistry(filePath);
    } finally {
        await rm(filePath, {force: true});
    }
};

beforeEach(() => insertMany.mockReset());

test('skips names repeated in a batch and continues after database duplicates', async () => {
    insertMany.mockResolvedValueOnce({insertedCount: 2});
    insertMany.mockRejectedValueOnce(Object.assign(new Error('Duplicate key'), {
        writeErrors: [{code: 11000, index: 0}],
        insertedDocs: [{name: 'Warfarin'}],
        mongoose: {validationErrors: []}
    }));

    const result = await importCsv([
        'Aspirin,aspirin', ' ASPIRIN ,aspirin', 'Ibuprofen,ibuprofen',
        'Aspirin,aspirin', 'Warfarin,warfarin'
    ]);

    expect(result).toEqual({totalRows: 5, importedRows: 3, skippedDuplicates: 2});
    expect(insertMany).toHaveBeenCalledTimes(2);
    expect(insertMany.mock.calls[0][0].map((drug) => drug.normalizedName))
        .toEqual(['aspirin', 'ibuprofen']);
    expect(insertMany).toHaveBeenCalledWith(expect.any(Array), {
        ordered: false, rawResult: true, throwOnValidationError: true
    });
});

test('stops on write errors other than duplicate keys', async () => {
    insertMany.mockRejectedValueOnce(Object.assign(new Error('Database error'), {
        writeErrors: [{code: 121, index: 0}],
        insertedDocs: []
    }));

    await expect(importCsv(['Aspirin,aspirin', 'Ibuprofen,ibuprofen']))
        .rejects.toThrow('Database error');
});

test('continues after a single duplicate key error without a writeErrors array', async () => {
    insertMany.mockRejectedValueOnce(Object.assign(new Error('Duplicate key'), {
        code: 11000,
        insertedDocs: [{name: 'Ibuprofen'}]
    }));
    insertMany.mockResolvedValueOnce({insertedCount: 1});

    await expect(importCsv([
        'Aspirin,aspirin', 'Ibuprofen,ibuprofen', 'Warfarin,warfarin'
    ])).resolves.toEqual({totalRows: 3, importedRows: 2, skippedDuplicates: 1});
    expect(insertMany).toHaveBeenCalledTimes(2);
});

test('stops when a batch also has validation errors', async () => {
    insertMany.mockRejectedValueOnce(Object.assign(new Error('Invalid row'), {
        writeErrors: [{code: 11000, index: 0}],
        insertedDocs: [],
        mongoose: {validationErrors: [new Error('Invalid ingredient')]}
    }));

    await expect(importCsv(['Aspirin,aspirin', 'Ibuprofen,ibuprofen']))
        .rejects.toThrow('Invalid row');
});
