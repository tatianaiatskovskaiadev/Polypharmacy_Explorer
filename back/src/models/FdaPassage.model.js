import {Schema, model} from 'mongoose';

const fdaPassageSchema = new Schema({
    drugId: {type: Schema.Types.ObjectId, ref: 'Drug', required: true, index: true},
    drugName: {type: String, required: true},
    labelId: {type: String, required: true},
    sourceUrl: {type: String, required: true},
    section: {type: String, required: true},
    chunkIndex: {type: Number, required: true},
    text: {type: String, required: true},
    contentHash: {type: String, required: true},
    embeddingModel: {type: String, required: true},
    embedding: {type: [Number], required: true}
}, {timestamps: true});

fdaPassageSchema.index({drugId: 1, labelId: 1, section: 1, chunkIndex: 1}, {unique: true});

export const FdaPassage = model('FdaPassage', fdaPassageSchema);
