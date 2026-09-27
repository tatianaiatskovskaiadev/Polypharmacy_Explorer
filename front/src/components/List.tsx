import type {Drug} from "../utils/types";

type Props = {
    data?: Drug[];
    isLoading: boolean;
    isError: boolean;
    onAdd: (drug: Drug) => void;
}

const List = ({data, isLoading, isError, onAdd} : Props) => {
    if (isLoading) return <div>Loading...</div>;
    if (isError) return <div>Error...</div>;
    if (!data) return null;

    return (
        <ul className="m-2 border border-gray-200 rounded-md w-fit">
            {data.map((item: Drug) => (
                <li
                    key={item._id}
                    onClick={() => onAdd(item)}
                    className="p-2 cursor-pointer hover:bg-blue-50 transition-colors flex justify-between gap-4"
                >
                    <span><strong>{item.name}</strong> ({item.activeIngredient})</span>
                    <span className="text-blue-500 font-bold">+</span>
                </li>
            ))}
        </ul>
    );
};

export default List;