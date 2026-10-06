import mongoose from 'mongoose';
import config, {validateRuntimeConfig} from '../../../configuration/config.js';
import {startMailWorker} from '../services/mail-queue.service.js';

try {
    validateRuntimeConfig();
    await mongoose.connect(config.mongodb.uri, config.mongodb.db);
    startMailWorker();
    console.log('Mail worker running. Press Ctrl+C to stop.');
} catch {
    console.error('Mail worker startup failed; check MongoDB and runtime configuration');
    process.exitCode = 1;
}
