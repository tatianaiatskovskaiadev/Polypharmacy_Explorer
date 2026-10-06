import {AuthToken} from '../../auth/models/AuthToken.model.js';
import {MailJob} from '../models/MailJob.model.js';

export const createMailJob = (data, session) => (
    session ? MailJob.create([data], {session}) : MailJob.create(data)
);
export const leaseNextMailJob = (now, leaseId, leaseDurationMs) => MailJob.findOneAndUpdate({
    state: 'pending',
    nextAttemptAt: {$lte: now},
    expiresAt: {$gt: now},
    $or: [{leaseUntil: null}, {leaseUntil: {$lte: now}}]
}, {
    $set: {leaseId, leaseUntil: new Date(now.getTime() + leaseDurationMs)},
    $inc: {attempts: 1}
}, {sort: {nextAttemptAt: 1}, returnDocument: 'after'});
export const createAuthToken = (data) => AuthToken.create(data);
export const isMailJobLeased = (id, leaseId) => MailJob.exists({_id: id, leaseId, state: 'pending'});
export const markMailJobSent = (id, leaseId) => MailJob.updateOne({_id: id, leaseId}, {
    $set: {state: 'sent', completedAt: new Date()},
    $unset: {leaseId: 1, leaseUntil: 1}
});
export const retryOrFailMailJob = (id, leaseId, state, nextAttemptAt) => MailJob.updateOne({_id: id, leaseId}, {
    $set: {state, nextAttemptAt},
    $unset: {leaseId: 1, leaseUntil: 1}
});
