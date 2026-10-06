import * as drugRepository from '../repository/drug.repository.js';
import {buildNormalizedNameBackfillPlan} from './drug-normalization-migration.service.js';

export const backfillNormalizedNames = async ({dryRun = false, skipIndex = false} = {}) => {
    const drugs = await drugRepository.listNamesForBackfill();
    const {updates, duplicates} = buildNormalizedNameBackfillPlan(drugs);

    if (!dryRun && duplicates.length === 0) {
        if (updates.length > 0) await drugRepository.updateNormalizedNames(updates);
        if (!skipIndex) await drugRepository.createNormalizedNameIndex();
    }

    return {scanned: drugs.length, updateCount: updates.length, duplicates};
};
