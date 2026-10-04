export const runWithConcurrency = async (items, limit, task) => {
    const results = new Array(items.length);
    const workerCount = Math.min(limit, items.length);
    const workers = Array.from({length: workerCount}, async (_, workerIndex) => {
        for (let index = workerIndex; index < items.length; index += workerCount) {
            results[index] = await task(items[index]);
        }
    });

    await Promise.all(workers);
    return results;
};
