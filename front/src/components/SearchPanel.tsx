import {useEffect, useState} from "react";
import {
    useLazyGetDrugsQuery,
    useLazyGetInteractionsQuery,
    useSearchBySymptomsMutation
} from "../features/api/drugApi.ts";
import List from "./List.tsx";
import GraphView from "./GraphView.tsx";
import type {Drug, Interaction} from "../utils/types";

type ApiError = {
    status?: number | string;
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
    const status = (error as ApiError | undefined)?.status;

    if (status === 401) {
        return 'Demo API key is missing or invalid. Check VITE_DEMO_API_KEY.';
    }

    if (status === 429) {
        return 'Too many requests. Please wait a minute and try again.';
    }

    return fallback;
};

const SearchPanel = () => {
    const [activeDrugs, setActiveDrugs] = useState<Drug[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [getDrugs, {data: searchResults, isLoading, isError, error: searchError}] = useLazyGetDrugsQuery();
    const [
        getInteractions,
        {
            data: interactionResponse,
            isFetching: isLoadingInteractions,
            isError: isInteractionError,
            error: interactionError
        }
    ] = useLazyGetInteractionsQuery()

    const [symptomText, setSymptomText] = useState('');
    const [
        searchBySymptoms,
        {
            data: highlightedDrugs,
            isLoading: isLoadingSymptoms,
            isError: isSymptomError,
            error: symptomError
        }
    ] = useSearchBySymptomsMutation()

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

    const handleRemoveDrug = (drugId: string) => {
        setActiveDrugs((prev) => prev.filter((drug) => drug._id !== drugId));
    };

    const activeDrugIds = new Set(activeDrugs.map((drug) => drug._id));
    const visibleInteractions: Interaction[] = (interactionResponse?.interactions ?? []).filter(
        (interaction) =>
            activeDrugIds.has(interaction.drugA) &&
            activeDrugIds.has(interaction.drugB)
    );

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
                    disabled={isLoading}
                    onClick={() => {
                        if (!searchTerm) return;
                        getDrugs(searchTerm)
                        setSearchTerm('')
                    }}
                >{isLoading ? 'Searching...' : 'Search'}
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
                    disabled={isLoadingSymptoms || activeDrugs.length === 0}
                    onClick={() => {
                        if (!symptomText) return;
                        if (activeDrugs.length > 0) {
                            searchBySymptoms({text: symptomText, drugIds: activeDrugs.map(d => d._id)})
                            setSymptomText('')
                        }
                    }}
                >{isLoadingSymptoms ? 'Checking...' : 'Search'}
                </button>
            </label>
            <List
                data={searchResults}
                onAdd={handleAddDrug}
                isLoading={isLoading}
                isError={isError}
                errorMessage={getApiErrorMessage(searchError, 'Unable to search drugs.')}
            />
            {activeDrugs.length ? (
                <div className="m-2 flex flex-wrap gap-2">
                    {activeDrugs.map((drug) => (
                        <button
                            key={drug._id}
                            className="border border-gray-300 rounded-md px-2 py-1 text-sm hover:bg-gray-50"
                            onClick={() => handleRemoveDrug(drug._id)}
                            type="button"
                        >
                            {drug.name} ×
                        </button>
                    ))}
                </div>
            ) : null}
            {isLoadingInteractions ? (
                <div className="m-2 text-sm text-gray-600">Checking drug interactions...</div>
            ) : null}
            {isInteractionError ? (
                <div className="m-2 text-sm text-red-700">
                    {getApiErrorMessage(interactionError, 'Unable to check interactions.')}
                </div>
            ) : null}
            {isLoadingSymptoms ? (
                <div className="m-2 text-sm text-gray-600">Searching selected drugs by symptom...</div>
            ) : null}
            {isSymptomError ? (
                <div className="m-2 text-sm text-red-700">
                    {getApiErrorMessage(symptomError, 'Unable to search symptoms.')}
                </div>
            ) : null}
            {interactionResponse?.failedPairs.length ? (
                <div className="m-2 text-sm text-yellow-700">
                    Some interaction checks are temporarily unavailable. Showing cached and completed results.
                </div>
            ) : null}
            <GraphView
                highlightedDrugs={highlightedDrugs}
                data={activeDrugs}
                interactions={visibleInteractions}
            />
        </div>
    );
};

export default SearchPanel;
