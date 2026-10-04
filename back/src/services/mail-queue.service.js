import {createHash, randomBytes, randomUUID} from 'crypto';
import {AuthToken} from '../models/AuthToken.model.js';
import {MailJob} from '../models/MailJob.model.js';
import {User} from '../models/User.model.js';
import {logEvent} from '../middlewares/request-logging.middleware.js';
import {sendActionEmail} from './mail.service.js';

const MAIL_LEASE_MS = 120_000;
const MAIL_RETRY_BASE_MS = 60_000;
const MAIL_MAX_ATTEMPTS = 5;
const MAIL_BATCH_SIZE = 10;
const MAIL_POLL_MS = 5_000;

const durationFor = (purpose) => purpose === 'verify-email' ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000;

export const queueActionEmail = async (userId, purpose, session) => {
    const now = new Date();
    const data = {
        userId,
        purpose,
        nextAttemptAt: now,
        expiresAt: new Date(now.getTime() + durationFor(purpose)),
        purgeAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    };
    if (session) await MailJob.create([data], {session});
    else await MailJob.create(data);
};

export const processNextMailJob = async (now = new Date()) => {
    const leaseId = randomUUID();
    const job = await MailJob.findOneAndUpdate({
        state: 'pending',
        nextAttemptAt: {$lte: now},
        expiresAt: {$gt: now},
        $or: [{leaseUntil: null}, {leaseUntil: {$lte: now}}]
    }, {
        $set: {leaseId, leaseUntil: new Date(now.getTime() + MAIL_LEASE_MS)},
        $inc: {attempts: 1}
    }, {sort: {nextAttemptAt: 1}, returnDocument: 'after'});
    if (!job) return false;

    try {
        const user = await User.findById(job.userId);
        if (!user) throw new Error('Mail recipient no longer exists');
        if (job.purpose === 'verify-email' && user.emailVerifiedAt !== null) {
            await MailJob.updateOne({_id: job._id, leaseId}, {$set: {state: 'sent', completedAt: new Date()}, $unset: {leaseId: 1, leaseUntil: 1}});
            return true;
        }
        const token = randomBytes(32).toString('hex');
        await AuthToken.create({
            userId: job.userId,
            purpose: job.purpose,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + durationFor(job.purpose))
        });
        if (!await MailJob.exists({_id: job._id, leaseId, state: 'pending'})) return true;
        await sendActionEmail(user.email, job.purpose, token);
        await MailJob.updateOne({_id: job._id, leaseId}, {
            $set: {state: 'sent', completedAt: new Date()},
            $unset: {leaseId: 1, leaseUntil: 1}
        });
    } catch {
        const failed = job.attempts >= MAIL_MAX_ATTEMPTS;
        await MailJob.updateOne({_id: job._id, leaseId}, {
            $set: {
                state: failed ? 'failed' : 'pending',
                nextAttemptAt: new Date(now.getTime() + MAIL_RETRY_BASE_MS * 2 ** (job.attempts - 1))
            },
            $unset: {leaseId: 1, leaseUntil: 1}
        });
        logEvent('error', 'mail_delivery_failed', {jobId: String(job._id), attempts: job.attempts, terminal: failed});
    }
    return true;
};

export const processMailQueueBatch = async () => {
    for (let processed = 0; processed < MAIL_BATCH_SIZE; processed += 1) {
        if (!await processNextMailJob()) break;
    }
};

export const startMailWorker = () => {
    let running = false;
    const poll = async () => {
        if (running) return;
        running = true;
        try {
            await processMailQueueBatch();
        } catch {
            logEvent('error', 'mail_worker_failed');
        } finally {
            running = false;
        }
    };
    void poll();
    return setInterval(poll, MAIL_POLL_MS);
};
