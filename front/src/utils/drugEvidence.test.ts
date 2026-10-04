import assert from 'node:assert/strict';
import test from 'node:test';
import type {Drug} from './types';
import {isPubChemOnlyDrug} from './drugEvidence.ts';

const drugWithEvidence = (source: string, verificationUrl?: string): Drug => ({
    _id: 'drug-1',
    name: 'Drug',
    activeIngredient: 'Ingredient',
    guidelines: {source, verificationUrl}
});

test('flags PubChem-only identities without FDA evidence', () => {
    assert.equal(isPubChemOnlyDrug(drugWithEvidence('PubChem (NIH)')), true);
    assert.equal(isPubChemOnlyDrug(drugWithEvidence('PubChem (NIH)', 'https://example.com/label')), false);
    assert.equal(isPubChemOnlyDrug(drugWithEvidence('openFDA')), false);
});
