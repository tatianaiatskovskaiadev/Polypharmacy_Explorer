import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const mailJobCreate = jest.fn();
const findOneAndUpdate = jest.fn();
const mailJobUpdateOne = jest.fn();
const mailJobExists = jest.fn().mockResolvedValue(true);
const userFindById = jest.fn();
const authTokenCreate = jest.fn();
const sendActionEmail = jest.fn();
const logEvent = jest.fn();

jest.unstable_mockModule('../models/MailJob.model.js', () => ({
    MailJob: {create: mailJobCreate, findOneAndUpdate, updateOne: mailJobUpdateOne, exists: mailJobExists}
}));
jest.unstable_mockModule('../models/User.model.js', () => ({User: {findById: userFindById}}));
jest.unstable_mockModule('../models/AuthToken.model.js', () => ({AuthToken: {create: authTokenCreate}}));
jest.unstable_mockModule('./mail.service.js', () => ({sendActionEmail}));
jest.unstable_mockModule('../middlewares/request-logging.middleware.js', () => ({logEvent}));

const {queueActionEmail, processNextMailJob} = await import('./mail-queue.service.js');

describe('mail outbox', () => {
    beforeEach(() => {
        for (const mock of [mailJobCreate, findOneAndUpdate, mailJobUpdateOne, userFindById,
            authTokenCreate, sendActionEmail, logEvent]) mock.mockReset();
        mailJobExists.mockReset().mockResolvedValue(true);
    });

    test('stores only delivery metadata in the registration transaction', async () => {
        const session = {id: 'transaction-1'};
        await queueActionEmail('user-1', 'verify-email', session);

        const [jobs, options] = mailJobCreate.mock.calls[0];
        expect(options).toEqual({session});
        expect(jobs).toEqual([expect.objectContaining({
            userId: 'user-1', purpose: 'verify-email', nextAttemptAt: expect.any(Date),
            expiresAt: expect.any(Date), purgeAt: expect.any(Date)
        })]);
        expect(JSON.stringify(jobs)).not.toMatch(/token|password|https?:/i);
    });

    test('retries an SMTP failure after a lease and succeeds after worker restart', async () => {
        const firstAttempt = new Date('2026-10-04T10:00:00Z');
        const secondAttempt = new Date('2026-10-04T10:02:00Z');
        findOneAndUpdate
            .mockResolvedValueOnce({_id: 'job-1', userId: 'user-1', purpose: 'reset-password', attempts: 1})
            .mockResolvedValueOnce({_id: 'job-1', userId: 'user-1', purpose: 'reset-password', attempts: 2});
        userFindById.mockResolvedValue({email: 'person@example.com'});
        sendActionEmail.mockRejectedValueOnce(new Error('private SMTP detail')).mockResolvedValueOnce(undefined);

        expect(await processNextMailJob(firstAttempt)).toBe(true);
        expect(findOneAndUpdate.mock.calls[0][0]).toEqual(expect.objectContaining({
            state: 'pending', nextAttemptAt: {$lte: firstAttempt},
            $or: [{leaseUntil: null}, {leaseUntil: {$lte: firstAttempt}}]
        }));
        expect(mailJobUpdateOne.mock.calls[0][1].$set).toEqual(expect.objectContaining({
            state: 'pending', nextAttemptAt: new Date('2026-10-04T10:01:00Z')
        }));
        expect(logEvent).toHaveBeenCalledWith('error', 'mail_delivery_failed', {
            jobId: 'job-1', attempts: 1, terminal: false
        });

        expect(await processNextMailJob(secondAttempt)).toBe(true);
        expect(mailJobUpdateOne.mock.calls[1][1].$set.state).toBe('sent');
        const firstToken = sendActionEmail.mock.calls[0][2];
        const secondToken = sendActionEmail.mock.calls[1][2];
        expect(firstToken).toMatch(/^[a-f0-9]{64}$/);
        expect(secondToken).not.toBe(firstToken);
        expect(JSON.stringify(authTokenCreate.mock.calls)).not.toContain(firstToken);
        expect(JSON.stringify(authTokenCreate.mock.calls)).not.toContain(secondToken);
    });

    test('marks delivery failed after the final attempt', async () => {
        findOneAndUpdate.mockResolvedValue({_id: 'job-2', userId: 'user-1', purpose: 'verify-email', attempts: 5});
        userFindById.mockResolvedValue({email: 'person@example.com', emailVerifiedAt: null});
        sendActionEmail.mockRejectedValue(new Error('SMTP unavailable'));

        await processNextMailJob(new Date('2026-10-04T10:00:00Z'));

        expect(mailJobUpdateOne.mock.calls[0][1].$set.state).toBe('failed');
        expect(logEvent.mock.calls[0][2]).toEqual(expect.objectContaining({terminal: true}));
    });

    test('reclaims an unfinished job after the previous worker lease expires', async () => {
        const restartedAt = new Date('2026-10-04T10:05:00Z');
        findOneAndUpdate.mockResolvedValue({_id: 'job-4', userId: 'user-1', purpose: 'verify-email', attempts: 2});
        userFindById.mockResolvedValue({email: 'person@example.com', emailVerifiedAt: null});

        expect(await processNextMailJob(restartedAt)).toBe(true);

        expect(findOneAndUpdate.mock.calls[0][0].$or).toEqual([
            {leaseUntil: null}, {leaseUntil: {$lte: restartedAt}}
        ]);
        expect(sendActionEmail).toHaveBeenCalledWith('person@example.com', 'verify-email', expect.any(String));
        expect(mailJobUpdateOne.mock.calls[0][1].$set.state).toBe('sent');
    });

    test('does not send a reset email cancelled during processing', async () => {
        findOneAndUpdate.mockResolvedValue({_id: 'job-3', userId: 'user-1', purpose: 'reset-password', attempts: 1});
        userFindById.mockResolvedValue({email: 'person@example.com'});
        mailJobExists.mockResolvedValue(false);

        await processNextMailJob();

        expect(sendActionEmail).not.toHaveBeenCalled();
    });
});
