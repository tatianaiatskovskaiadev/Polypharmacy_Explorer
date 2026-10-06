import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const create = jest.fn();
const findOneAndUpdate = jest.fn();
const updateOne = jest.fn();
const userExists = jest.fn();

jest.unstable_mockModule('../repository/auth.repository.js', () => ({userExists}));

jest.unstable_mockModule('../models/Invitation.model.js', () => ({
    Invitation: {create, findOneAndUpdate, updateOne}
}));

const {issueInvitation, claimInvitation, releaseInvitation} = await import('./invitation.service.js');

describe('invitation service', () => {
    beforeEach(() => {
        create.mockReset();
        findOneAndUpdate.mockReset();
        updateOne.mockReset();
        userExists.mockReset().mockResolvedValue(false);
    });

    test('issues a seven-day email-bound code and stores only its hash', async () => {
        const {token, expiresAt} = await issueInvitation(' Person@Example.com ');
        const saved = create.mock.calls[0][0];

        expect(token).toMatch(/^[a-f0-9]{64}$/);
        expect(saved).toEqual({
            email: 'person@example.com', tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAt
        });
        expect(saved.tokenHash).not.toBe(token);
        expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    });

    test('claims a matching active code atomically and rejects a reused code', async () => {
        findOneAndUpdate.mockResolvedValueOnce({_id: 'invitation-1'}).mockResolvedValueOnce(null);

        const claim = await claimInvitation('PERSON@example.com', 'a'.repeat(64));
        expect(claim.id).toBe('invitation-1');
        expect(findOneAndUpdate).toHaveBeenCalledWith({
            email: 'person@example.com', tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            consumedAt: null, expiresAt: {$gt: expect.any(Date)}
        }, {$set: {consumedAt: claim.consumedAt}}, {returnDocument: 'after'});
        await expect(claimInvitation('PERSON@example.com', 'a'.repeat(64)))
            .rejects.toMatchObject({statusCode: 403});
        await releaseInvitation(claim);
        expect(updateOne).toHaveBeenCalledWith(
            {_id: 'invitation-1', consumedAt: claim.consumedAt}, {$set: {consumedAt: null}}
        );
    });
});
