import {Schema, model} from "mongoose";

const interactionSchema = new Schema({
    drugA: { type: Schema.Types.ObjectId, ref: 'Drug', required: true },
    drugB: { type: Schema.Types.ObjectId, ref: 'Drug', required: true },

    riskLevel: {
        type: String,
        enum: ['minor', 'moderate', 'major', 'critical'],
        required: true
    },
    colorCode: {
        type: String,
        enum: ['green', 'yellow', 'orange', 'red'],
        required: true
    },
    description: { type: String, required: true },
    actionRequired: { type: String },
    searchText: {type: String, select: false},
    embedding: {type: [Number], select: false},
    embeddingModel: {type: String, select: false},
    source: {type: String},
    sourceUrl: {type: String},
    sourceText: {type: String},
    sourceRetrievedAt: {type: Date},
    analysisVersion: { type: Number, required: true, default: 1 }
}, { timestamps: true });


interactionSchema.index({ drugA: 1, drugB: 1 }, { unique: true });

export const Interaction = model('Interaction', interactionSchema);
