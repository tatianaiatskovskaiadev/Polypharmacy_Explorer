import mongoose from 'mongoose';
import {normalizeDrugName} from '../utils/normalization.js';

const { Schema, model } = mongoose;

const drugSchema = new Schema({
    name: { type: String, required: true, index: true },
    normalizedName: { type: String, required: true, unique: true, index: true },
    activeIngredient: { type: String, required: true },

    guidelines: {
        source: { type: String, default: 'FDA' },
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

drugSchema.pre('validate', function setNormalizedName(next) {
    if (this.name) {
        this.normalizedName = normalizeDrugName(this.name);
    }
    next();
});

export const Drug = model('Drug', drugSchema);
