import type {RagSource} from '../utils/types';

type Props = {
    title: string;
    answer: string;
    sources: RagSource[];
    pubChemOnlyDrugNames?: string[];
    toolCalls?: {name: string; status: 'ok' | 'error'}[];
};

const EvidenceAnswer = ({title, answer, sources, pubChemOnlyDrugNames = [], toolCalls}: Props) => (
    <section className="m-2 max-w-2xl rounded-md border border-blue-300 bg-blue-50 p-3" aria-label={title}>
        <h2 className="font-semibold">{title}</h2>
        {pubChemOnlyDrugNames.length > 0 ? (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                PubChem only: {pubChemOnlyDrugNames.join(', ')}. These entries have no indexed FDA label passages. This answer may cover only the other selected drugs.
            </p>
        ) : null}
        {toolCalls?.length ? (
            <p className="mt-2 text-xs text-gray-600">
                Tools: {toolCalls.map((call) => `${call.name} (${call.status})`).join(' → ')}
            </p>
        ) : null}
        <p className="mt-2 whitespace-pre-wrap">{answer}</p>
        {sources.length > 0 ? (
            <ol className="mt-3 space-y-2 text-sm">
                {sources.map((source) => (
                    <li key={source.number}>
                        [{source.number}] {source.drugName} — {source.section.replaceAll('_', ' ')}:{' '}
                        <a className="underline" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">FDA label</a>
                        <p className="mt-1 text-gray-700">{source.text}</p>
                    </li>
                ))}
            </ol>
        ) : null}
        <p className="mt-3 text-xs text-gray-600">AI-generated summary of FDA label excerpts. Not medical advice.</p>
    </section>
);

export default EvidenceAnswer;
