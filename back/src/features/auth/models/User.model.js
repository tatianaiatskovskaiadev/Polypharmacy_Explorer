import {Schema, model} from 'mongoose';

const userSchema = new Schema({
    email: {type: String, required: true, unique: true, lowercase: true, trim: true},
    passwordHash: {type: String, required: true, select: false},
    emailVerifiedAt: {type: Date},
    role: {type: String, enum: ['user', 'admin'], default: 'user'}
}, {timestamps: true});

export const User = model('User', userSchema);
