import {describe, expect, test} from '@jest/globals';
import {readdir, readFile} from 'node:fs/promises';

const sourceFiles = async (layer) => {
    const domains = await readdir(new URL('./features/', import.meta.url), {withFileTypes: true});
    const results = [];
    for (const domain of domains.filter((entry) => entry.isDirectory())) {
        const directory = new URL(`./features/${domain.name}/${layer}/`, import.meta.url);
        let files;
        try {
            files = await readdir(directory);
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        for (const file of files.filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'))) {
            results.push({file: `${domain.name}/${layer}/${file}`, source: await readFile(new URL(file, directory), 'utf8')});
        }
    }
    return results;
};

describe('backend layers', () => {
    test('services do not import database models or HTTP middleware', async () => {
        for (const {file, source} of await sourceFiles('services')) {
            const forbiddenImport = source.match(/from\s+['"](?:[^'"]*\/(?:models|middlewares)\/|mongoose['"])/)?.[0];
            expect({file, forbiddenImport}).toEqual({file, forbiddenImport: undefined});
        }
    });

    test('controllers do not import repositories or database models', async () => {
        for (const {source} of await sourceFiles('controllers')) {
            expect(source).not.toMatch(/from\s+['"][^'"]*\/(?:repository|models)\//);
            expect(source).not.toMatch(/from\s+['"]mongoose['"]/);
        }
    });

    test('routes do not import services or repositories', async () => {
        for (const {source} of await sourceFiles('routes')) {
            expect(source).not.toMatch(/from\s+['"][^'"]*\/(?:services|repository|models)\//);
        }
    });
});
