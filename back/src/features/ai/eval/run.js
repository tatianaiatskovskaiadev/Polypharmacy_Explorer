import {readFile} from 'node:fs/promises';
import {evaluateRagCase} from './ragEvaluator.js';
import {evaluateAgentCase} from './agentEvaluator.js';

const kind = process.argv[2];
if (!['rag', 'agent'].includes(kind)) {
    throw new Error('Usage: node src/features/ai/eval/run.js <rag|agent>');
}

const cases = JSON.parse(await readFile(new URL(`../../../../evals/${kind}-cases.json`, import.meta.url), 'utf8'));
const evaluate = kind === 'rag' ? evaluateRagCase : evaluateAgentCase;
const results = [];
for (const testCase of cases) results.push(await evaluate(testCase));

for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id} ${JSON.stringify(result.checks)}`);
}
const passed = results.filter((result) => result.passed).length;
console.log(`${kind.toUpperCase()} evaluation: ${passed}/${results.length} passed`);
if (passed !== results.length) process.exitCode = 1;
