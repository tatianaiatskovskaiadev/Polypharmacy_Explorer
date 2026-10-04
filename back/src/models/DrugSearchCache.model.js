import {Schema, model} from 'mongoose';

const drugSearchCacheSchema = new Schema({
    query: {type: String, required: true, unique: true},
    drugIds: [{type: Schema.Types.ObjectId, ref: 'Drug'}],
    searchVersion: {type: Number, required: true},
    expiresAt: {type: Date, required: true}
});

drugSearchCacheSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

export const DrugSearchCache = model('DrugSearchCache', drugSearchCacheSchema);
