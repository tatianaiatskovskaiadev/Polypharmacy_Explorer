import {Schema, model} from 'mongoose';

const sessionSchema = new Schema({
    userId: {type: Schema.Types.ObjectId, ref: 'User', required: true, index: true},
    tokenHash: {type: String, required: true, unique: true},
    csrfToken: {type: String, required: true},
    expiresAt: {type: Date, required: true}
}, {timestamps: true});

sessionSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

export const Session = model('Session', sessionSchema);
