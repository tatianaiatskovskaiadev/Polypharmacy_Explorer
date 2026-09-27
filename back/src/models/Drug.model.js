import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const drugSchema = new Schema({
    name: { type: String, required: true, index: true },
    activeIngredient: { type: String, required: true },

    guidelines: {
        source: { type: String, default: 'FDA' },
        originalText: { type: String, required: true },
        embedding: {
            type: [Number],
            required: true
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

export const Drug = model('Drug', drugSchema);