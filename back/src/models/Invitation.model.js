import {Schema, model} from 'mongoose';

const invitationSchema = new Schema({
    email: {type: String, required: true, lowercase: true, trim: true},
    tokenHash: {type: String, required: true, unique: true},
    expiresAt: {type: Date, required: true},
    consumedAt: {type: Date, default: null}
}, {timestamps: true});

invitationSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

export const Invitation = model('Invitation', invitationSchema);
