import mongoose from 'mongoose';

export const isDatabaseConnected = () => mongoose.connection.readyState === 1;
