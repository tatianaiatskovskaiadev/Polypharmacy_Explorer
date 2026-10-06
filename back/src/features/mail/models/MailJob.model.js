import {Schema, model} from 'mongoose';

const mailJobSchema = new Schema({
    userId: {type: Schema.Types.ObjectId, ref: 'User', required: true, index: true},
    purpose: {type: String, enum: ['verify-email', 'reset-password'], required: true},
    state: {type: String, enum: ['pending', 'sent', 'failed'], default: 'pending'},
    attempts: {type: Number, default: 0},
    nextAttemptAt: {type: Date, required: true},
    leaseUntil: {type: Date, default: null},
    leaseId: {type: String, default: null},
    expiresAt: {type: Date, required: true},
    purgeAt: {type: Date, required: true},
    completedAt: {type: Date}
}, {timestamps: true});

mailJobSchema.index({state: 1, nextAttemptAt: 1, leaseUntil: 1});
mailJobSchema.index({purgeAt: 1}, {expireAfterSeconds: 0});

export const MailJob = model('MailJob', mailJobSchema);
