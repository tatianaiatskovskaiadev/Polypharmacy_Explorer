import type {Drug} from './types';

export const isPubChemOnlyDrug = (drug: Drug) =>
    drug.guidelines?.source === 'PubChem (NIH)' && !drug.guidelines.verificationUrl;
