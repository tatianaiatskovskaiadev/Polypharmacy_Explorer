import type {Drug} from "../utils/types";

type Props = {
    data?: Drug[];
    isLoading: boolean;
    isError: boolean;
    errorMessage?: string;
    onAdd: (drug: Drug) => void;
}

const List = ({data, isLoading, isError, errorMessage, onAdd} : Props) => {
    if (isLoading) return <div>Loading...</div>;
    if (isError) return <div className="m-2 text-sm text-red-700">{errorMessage ?? 'Unable to load drugs.'}</div>;
    if (!data) return null;
    if (data.length === 0) return <div className="m-2 text-sm text-gray-500">No drugs found.</div>;

    return (
        <ul className="m-2 border border-gray-200 rounded-md w-fit">
            {data.map((item: Drug) => (
                <li
                    key={item._id}
                    onClick={() => onAdd(item)}
                    className="p-2 cursor-pointer hover:bg-blue-50 transition-colors flex justify-between gap-4"
                >
                    <span>
                        <strong>{item.name}</strong> ({item.activeIngredient})
                        {item.guidelines?.sourceUrl ? (
                            <small className="block text-gray-600">
                                Source: <a
                                    className="underline"
                                    href={item.guidelines.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                >{item.guidelines.source}</a>.
                                {item.guidelines.verificationUrl ? (
                                    <> Ingredient label: <a
                                        className="underline"
                                        href={item.guidelines.verificationUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(event) => event.stopPropagation()}
                                    >{item.guidelines.verificationSource}</a>.</>
                                ) : item.guidelines.source === 'PubChem (NIH)'
                                    ? ' Chemical identity only; medicinal product and interactions are not verified.'
                                    : item.guidelines.source !== 'FDA' ? ' FDA label evidence is unavailable.' : null}
                            </small>
                        ) : null}
                    </span>
                    <span className="text-blue-500 font-bold">+</span>
                </li>
            ))}
        </ul>
    );
};

export default List;
