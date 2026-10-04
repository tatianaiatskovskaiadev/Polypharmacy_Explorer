import {Schema, model} from 'mongoose';

const authTokenSchema = new Schema({
    userId: {type: Schema.Types.ObjectId, ref: 'User', required: true, index: true},
    purpose: {type: String, enum: ['verify-email', 'reset-password'], required: true},
    tokenHash: {type: String, required: true, unique: true},
    expiresAt: {type: Date, required: true}
}, {timestamps: true});

authTokenSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});
authTokenSchema.index({userId: 1, purpose: 1});

export const AuthToken = model('AuthToken', authTokenSchema);
