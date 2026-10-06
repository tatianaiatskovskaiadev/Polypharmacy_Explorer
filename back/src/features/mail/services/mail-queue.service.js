import {createHash, randomBytes, randomUUID} from 'crypto';
import * as mailQueueRepository from '../repository/mail-queue.repository.js';
import {findUserById} from '../../auth/repository/auth.repository.js';
import {logEvent} from '../../../utils/logging.js';
import {sendActionEmail} from './mail.service.js';
import {
    MAIL_BATCH_SIZE,
    MAIL_LEASE_MS,
    MAIL_MAX_ATTEMPTS,
    MAIL_POLL_MS,
    MAIL_RETRY_BASE_MS
} from '../../../utils/constants.js';

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
    await mailQueueRepository.createMailJob(data, session);
};

export const processNextMailJob = async (now = new Date()) => {
    const leaseId = randomUUID();
    const job = await mailQueueRepository.leaseNextMailJob(now, leaseId, MAIL_LEASE_MS);
    if (!job) return false;

    try {
        const user = await findUserById(job.userId);
        if (!user) throw new Error('Mail recipient no longer exists');
        if (job.purpose === 'verify-email' && user.emailVerifiedAt !== null) {
            await mailQueueRepository.markMailJobSent(job._id, leaseId);
            return true;
        }
        const token = randomBytes(32).toString('hex');
        await mailQueueRepository.createAuthToken({
            userId: job.userId,
            purpose: job.purpose,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + durationFor(job.purpose))
        });
        if (!await mailQueueRepository.isMailJobLeased(job._id, leaseId)) return true;
        await sendActionEmail(user.email, job.purpose, token);
        await mailQueueRepository.markMailJobSent(job._id, leaseId);
    } catch {
        const failed = job.attempts >= MAIL_MAX_ATTEMPTS;
        await mailQueueRepository.retryOrFailMailJob(
            job._id, leaseId, failed ? 'failed' : 'pending',
            new Date(now.getTime() + MAIL_RETRY_BASE_MS * 2 ** (job.attempts - 1))
        );
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
