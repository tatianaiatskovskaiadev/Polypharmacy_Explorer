import {expect, test} from '@jest/globals';
import {runWithConcurrency} from './concurrency.js';

test('limits concurrent tasks and preserves input order in the results', async () => {
    let activeTasks = 0;
    let peakTasks = 0;

    const results = await runWithConcurrency([1, 2, 3, 4], 2, async (value) => {
        activeTasks++;
        peakTasks = Math.max(peakTasks, activeTasks);
        await new Promise((resolve) => setTimeout(resolve, value === 1 ? 10 : 1));
        activeTasks--;
        return value * 2;
    });

    expect(peakTasks).toBe(2);
    expect(results).toEqual([2, 4, 6, 8]);
});
