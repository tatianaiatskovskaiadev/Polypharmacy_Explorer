import type {Drug} from "../utils/types";
import {isPubChemOnlyDrug} from "../utils/drugEvidence.ts";

type Props = {
    data?: Drug[];
    isLoading: boolean;
    isError: boolean;
    errorMessage?: string;
    onAdd: (drug: Drug) => void;
}

const getEvidenceNote = (drug: Drug) => {
    if (isPubChemOnlyDrug(drug)) {
        return ' Chemical identity only; medicinal product and interactions are not verified.';
    }
    if (drug.guidelines?.source !== 'FDA') return ' FDA label evidence is unavailable.';
    return null;
};

const List = ({data, isLoading, isError, errorMessage, onAdd} : Props) => {
    if (isLoading) return <div>Loading...</div>;
    if (isError) return <div className="m-2 text-sm text-red-700">{errorMessage ?? 'Unable to load drugs.'}</div>;
    if (!data) return null;
    if (data.length === 0) return <div className="m-2 text-sm text-gray-500">No drugs found.</div>;

    return (
        <ul className="m-2 border border-gray-200 rounded-md w-fit">
            {data.map((item: Drug) => (
                <li key={item._id} className="p-2 hover:bg-blue-50 transition-colors">
                    <button
                        type="button"
                        aria-label={`Add ${item.name}`}
                        onClick={() => onAdd(item)}
                        className="flex w-full cursor-pointer items-center justify-between gap-4 text-left"
                    >
                        <span><strong>{item.name}</strong> ({item.activeIngredient})</span>
                        <span className="font-bold text-blue-500">+</span>
                    </button>
                    {item.guidelines?.sourceUrl ? (
                        <small className="block text-gray-600">
                            Source: <a
                                className="underline"
                                href={item.guidelines.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >{item.guidelines.source}</a>.
                            {item.guidelines.verificationUrl ? (
                                <> Ingredient label: <a
                                    className="underline"
                                    href={item.guidelines.verificationUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >{item.guidelines.verificationSource}</a>.</>
                            ) : getEvidenceNote(item)}
                        </small>
                    ) : null}
                    {item.guidelines?.source !== 'FDA' && !item.guidelines?.sourceUrl && (
                        <small className="block text-gray-600">
                            Source: {item.guidelines?.source ?? 'Unknown'}.{getEvidenceNote(item)}
                        </small>
                    )}
                </li>
            ))}
        </ul>
    );
};

export default List;
