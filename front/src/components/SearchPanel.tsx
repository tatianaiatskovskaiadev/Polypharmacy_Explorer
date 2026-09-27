import {useEffect, useState} from "react";
import {
    useLazyGetDrugsQuery,
    useLazyGetInteractionsQuery,
    useSearchBySymptomsMutation
} from "../features/api/drugApi.ts";
import List from "./List.tsx";
import GraphView from "./GraphView.tsx";
import type {Drug} from "../utils/types";

const SearchPanel = () => {
    const [activeDrugs, setActiveDrugs] = useState<Drug[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [getDrugs, {data: searchResults, isLoading, isError}] = useLazyGetDrugsQuery();
    const [getInteractions, {data: interactions}] = useLazyGetInteractionsQuery()

    const [symptomText, setSymptomText] = useState('');
    const [searchBySymptoms, {data: highlightedDrugs}] = useSearchBySymptomsMutation()

    useEffect(() => {
        if (activeDrugs.length > 1) {
            const drugIds = activeDrugs.map((drug) => drug._id);
            getInteractions({drugIds});
        }
    }, [activeDrugs, getInteractions]);

    const handleAddDrug = (newDrug: Drug) => {
        setActiveDrugs((prev) => {
            if (prev.some((drug) => drug._id === newDrug._id)) return prev;
            return [...prev, newDrug];
        });
    };

    return (
        <div className={'m-6'}>
            <label>Drugs:
                <input
                    className={'border border-gray-300 rounded-md p-2 m-2'}
                    type="text"
                    value={searchTerm}
                    placeholder="Search..."
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button
                    className={'border border-gray-300 rounded-md p-2 m-2'}
                    onClick={() => {
                        if (!searchTerm) return;
                        getDrugs(searchTerm)
                        setSearchTerm('')
                    }}
                >Search
                </button>
            </label>
            <label>Symptoms:
                <input
                    className={'border border-gray-300 rounded-md p-2 m-2'}
                    type="text"
                    value={symptomText}
                    placeholder="Search..."
                    onChange={(e) => setSymptomText(e.target.value)}
                />
                <button
                    className={'border border-gray-300 rounded-md p-2 m-2'}
                    onClick={() => {
                        if (!symptomText) return;
                        if (activeDrugs.length > 0) {
                            searchBySymptoms({text: symptomText, drugIds: activeDrugs.map(d => d._id)})
                            setSymptomText('')
                        }
                    }}
                >Search
                </button>
            </label>
            <List data={searchResults} onAdd={handleAddDrug} isLoading={isLoading} isError={isError}/>
            <GraphView highlightedDrugs={highlightedDrugs} data={activeDrugs} interactions={interactions}/>
        </div>
    );
};

export default SearchPanel;