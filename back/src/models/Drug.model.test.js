import {expect, test} from '@jest/globals';
import {Drug} from './Drug.model.js';

test('does not assign FDA provenance to drugs without guidelines', () => {
    const data = {name: 'Imported drug', activeIngredient: 'ingredient'};

    expect(new Drug(data).guidelines?.source).toBeUndefined();
    expect(Drug.hydrate(data).guidelines?.source).toBeUndefined();
});
