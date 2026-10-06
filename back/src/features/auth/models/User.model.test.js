import {expect, test} from '@jest/globals';
import {User} from './User.model.js';

test('defaults new accounts to the user role and rejects unsupported roles', async () => {
    const account = new User({email: 'person@example.com', passwordHash: 'hash'});
    expect(account.role).toBe('user');

    account.role = 'editor';
    await expect(account.validate()).rejects.toMatchObject({name: 'ValidationError'});
});
