import {Schema, model} from "mongoose";
import {normalizeDrugName} from '../middlewares/normalization.js';

const drugSchema = new Schema({
    name: { type: String, required: true, index: true },
    normalizedName: { type: String, required: true, unique: true, index: true },
    activeIngredient: { type: String, required: true },

    guidelines: {
        source: { type: String, default: 'FDA' },
        sourceUrl: {type: String},
        verificationSource: {type: String},
        verificationUrl: {type: String},
        originalText: {type: String},
        contentHash: {type: String},
        embedding: {
            type: [Number]
        }
    }
}, {
    timestamps: true,
    toJSON: {
        transform: (doc, ret) => {
            if (ret.guidelines) delete ret.guidelines.embedding;
            return ret;
        }
    }
});

drugSchema.pre('validate', function setNormalizedName() {
    if (this.name) {
        this.normalizedName = normalizeDrugName(this.name);
    }
});

export const Drug = model('Drug', drugSchema);
