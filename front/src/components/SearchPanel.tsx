import {useEffect, useState} from "react";
import {
    useAskAgentMutation,
    useAnswerQuestionMutation,
    useLazyGetDrugsQuery,
    useLazyGetInteractionsQuery,
    useSearchBySymptomsMutation
} from "../features/api/drugApi.ts";
import List from "./List.tsx";
import GraphView from "./GraphView.tsx";
import EvidenceAnswer from './EvidenceAnswer.tsx';
import type {Drug, Interaction} from "../utils/types";

type ApiError = {
    status?: number | string;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const getApiErrorMessage = (error: unknown, fallback: string) => {
    const status = (error as ApiError | undefined)?.status;

    if (status === 'FETCH_ERROR') {
        return `Backend is unreachable at ${API_BASE_URL}. Start the backend or check VITE_API_URL.`;
    }

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
    const [question, setQuestion] = useState('');
    const [askQuestion, {
        data: ragResult,
        isLoading: isLoadingAnswer,
        isError: isAnswerError,
        error: answerError,
        reset: resetAnswer
    }] = useAnswerQuestionMutation();
    const [askAgent, {
        data: agentResult,
        isLoading: isLoadingAgent,
        isError: isAgentError,
        error: agentError,
        reset: resetAgent
    }] = useAskAgentMutation();
    const [
        searchBySymptoms,
        {
            data: symptomSearchResult,
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
        resetAnswer();
        resetAgent();
        setActiveDrugs((prev) => {
            if (prev.some((drug) => drug._id === newDrug._id)) return prev;
            return [...prev, newDrug];
        });
    };

    const handleRemoveDrug = (drugId: string) => {
        resetAnswer();
        resetAgent();
        setActiveDrugs((prev) => prev.filter((drug) => drug._id !== drugId));
    };

    const activeDrugIds = new Set(activeDrugs.map((drug) => drug._id));

    const visibleInteractions: Interaction[] = (interactionResponse?.interactions ?? []).filter(
        (interaction) =>
            activeDrugIds.has(interaction.drugA) &&
            activeDrugIds.has(interaction.drugB)
    );

    const highlightedDrugs = symptomSearchResult?.drugs ?? [];
    const highlightedInteractions = symptomSearchResult?.interactions ?? [];
    const activeDrugById = new Map(activeDrugs.map((drug) => [drug._id, drug]));

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
                        const query = searchTerm.trim();
                        if (!query) return;
                        getDrugs(query, true)
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
                            {drug.name} x
                        </button>
                    ))}
                </div>
            ) : null}
            <form
                className="m-2 max-w-2xl rounded-md border border-gray-300 p-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (question.trim().length < 5 || activeDrugs.length === 0) return;
                    resetAgent();
                    askQuestion({question: question.trim(), drugIds: activeDrugs.map((drug) => drug._id)});
                }}
            >
                <label className="block font-medium" htmlFor="rag-question">Ask about selected drugs</label>
                <textarea
                    id="rag-question"
                    className="mt-2 w-full rounded-md border border-gray-300 p-2"
                    value={question}
                    maxLength={1000}
                    rows={3}
                    placeholder="What do the FDA labels say about these drugs?"
                    onChange={(event) => setQuestion(event.target.value)}
                />
                <button
                    className="mt-2 rounded-md border border-gray-300 px-3 py-2"
                    type="submit"
                    disabled={isLoadingAnswer || activeDrugs.length === 0 || question.trim().length < 5}
                >
                    {isLoadingAnswer ? 'Finding FDA evidence...' : 'Ask FDA labels'}
                </button>
                <button
                    className="mt-2 ml-2 rounded-md border border-gray-300 px-3 py-2"
                    type="button"
                    disabled={isLoadingAgent || activeDrugs.length === 0 || activeDrugs.length > 4 || question.trim().length < 5}
                    onClick={() => {
                        resetAnswer();
                        askAgent({question: question.trim(), drugIds: activeDrugs.map((drug) => drug._id)});
                    }}
                >
                    {isLoadingAgent ? 'Using tools...' : 'Ask agent'}
                </button>
                {activeDrugs.length === 0 ? <p className="mt-2 text-sm text-gray-600">Select a drug first.</p> : null}
                {activeDrugs.length > 4 ? <p className="mt-2 text-sm text-gray-600">The agent supports up to four selected drugs.</p> : null}
            </form>
            {isAnswerError ? (
                <div className="m-2 text-sm text-red-700">
                    {getApiErrorMessage(answerError, 'Unable to answer from FDA labels.')}
                </div>
            ) : null}
            {isAgentError ? (
                <div className="m-2 text-sm text-red-700">
                    {getApiErrorMessage(agentError, 'Unable to run the drug agent.')}
                </div>
            ) : null}
            {ragResult && !isLoadingAnswer ? (
                <EvidenceAnswer title="Answer from FDA labels" answer={ragResult.answer} sources={ragResult.sources}/>
            ) : null}
            {agentResult && !isLoadingAgent ? (
                <EvidenceAnswer
                    title="Agent answer from FDA labels"
                    answer={agentResult.answer}
                    sources={agentResult.sources}
                    toolCalls={agentResult.toolCalls}
                />
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
                <div className="m-2 max-w-2xl rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                    <div className="font-semibold">
                        Some interaction checks are temporarily unavailable. Showing cached and completed results.
                    </div>
                    <ul className="mt-2 list-disc pl-5">
                        {interactionResponse.failedPairs.map((failedPair) => (
                            <li key={`${failedPair.drugIdA}-${failedPair.drugIdB}`}>
                                <span className="font-medium">
                                    {failedPair.drugNameA} + {failedPair.drugNameB}
                                </span>
                                {failedPair.reason ? ` - ${failedPair.reason}` : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {highlightedInteractions.length ? (
                <div className="m-2 max-w-2xl rounded-md border border-purple-300 bg-purple-50 p-3 text-sm text-purple-900">
                    <div className="font-semibold">Symptom matched saved interaction summaries:</div>
                    <ul className="mt-2 list-disc pl-5">
                        {highlightedInteractions.map((interaction) => (
                            <li key={interaction._id}>
                                {(activeDrugById.get(interaction.drugA)?.name ?? interaction.drugA)}
                                {' + '}
                                {(activeDrugById.get(interaction.drugB)?.name ?? interaction.drugB)}
                                {` - ${interaction.riskLevel}: ${interaction.description}`}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            <GraphView
                highlightedDrugs={highlightedDrugs}
                highlightedInteractions={highlightedInteractions}
                data={activeDrugs}
                interactions={visibleInteractions}
            />
        </div>
    );
};

export default SearchPanel;
