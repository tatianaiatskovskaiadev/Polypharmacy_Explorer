import {Invitation} from '../models/Invitation.model.js';

export const createInvitation = (data) => Invitation.create(data);
export const consumeInvitation = (email, tokenHash, consumedAt) => Invitation.findOneAndUpdate({
    email, tokenHash, consumedAt: null, expiresAt: {$gt: consumedAt}
}, {$set: {consumedAt}}, {returnDocument: 'after'});
export const releaseInvitation = (id, consumedAt) => Invitation.updateOne(
    {_id: id, consumedAt}, {$set: {consumedAt: null}}
);
