import {useEffect, useRef, useState} from "react";
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
import type {AgentAnswerResponse, RagSource} from '../utils/types';
import {isPubChemOnlyDrug} from "../utils/drugEvidence.ts";
import {AgentStreamError, streamAgentAnswer} from '../features/api/agentStream.ts';
import type {AgentStreamEvent} from '../features/api/agentStream.ts';
import {useAppDispatch, useAppSelector} from '../app/hooks.ts';
import {clearSession} from '../features/auth/authSlice.ts';

type StreamPhase = 'idle' | 'planning' | 'using_tool' | 'retrieving' | 'generating' | 'complete' | 'error' | 'disconnected';

const STREAM_MESSAGES: Record<StreamPhase, string> = {
    idle: '',
    planning: 'Analyzing selected medications…',
    using_tool: 'Checking interaction evidence…',
    retrieving: 'Retrieving FDA label passages…',
    generating: 'Generating evidence-grounded answer…',
    complete: 'Answer complete.',
    error: 'The stream stopped with an error.',
    disconnected: 'Streaming stopped or connection lost.'
};

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
        return 'Session expired. Please sign in again.';
    }

    if (status === 429) {
        return 'Too many requests. Please wait a minute and try again.';
    }

    return fallback;
};

const SearchPanel = () => {
    const dispatch = useAppDispatch();
    const csrfToken = useAppSelector((state) => state.auth?.csrfToken ?? '');
    const streamController = useRef<AbortController | null>(null);
    const streamVersion = useRef(0);
    const [streamPhase, setStreamPhase] = useState<StreamPhase>('idle');
    const [streamAnswer, setStreamAnswer] = useState('');
    const [streamSources, setStreamSources] = useState<RagSource[]>([]);
    const [streamResult, setStreamResult] = useState<AgentAnswerResponse | null>(null);
    const [streamError, setStreamError] = useState('');
    const [streamSourceCount, setStreamSourceCount] = useState(0);
    const [activeDrugs, setActiveDrugs] = useState<Drug[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [getDrugs, {data: searchResponse, isLoading, isError, error: searchError}] = useLazyGetDrugsQuery();
    const searchResults = searchResponse?.drugs;
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

    useEffect(() => () => streamController.current?.abort(), []);

    const resetStream = () => {
        streamVersion.current++;
        streamController.current?.abort();
        streamController.current = null;
        setStreamPhase('idle');
        setStreamAnswer('');
        setStreamSources([]);
        setStreamResult(null);
        setStreamError('');
        setStreamSourceCount(0);
    };

    const startStream = async () => {
        resetStream();
        resetAnswer();
        resetAgent();
        const controller = new AbortController();
        streamController.current = controller;
        const version = streamVersion.current;
        setStreamPhase('planning');
        const onEvent = (event: AgentStreamEvent) => {
            if (version !== streamVersion.current) return;
            if (event.event === 'tool.started') {
                setStreamPhase(event.data.tool === 'search_fda_passages' ? 'retrieving' : 'using_tool');
            } else if (event.event === 'retrieval.completed') {
                setStreamSourceCount(event.data.sourceCount);
                setStreamPhase('retrieving');
            } else if (event.event === 'generation.started') {
                setStreamPhase('generating');
            } else if (event.event === 'answer.delta') {
                setStreamAnswer((answer) => answer + event.data.text);
            } else if (event.event === 'sources') {
                setStreamSources(event.data.sources);
            } else if (event.event === 'agent.completed') {
                setStreamResult(event.data.result);
                setStreamPhase('complete');
            }
        };
        try {
            await streamAgentAnswer({question: question.trim(), drugIds: activeDrugs.map((drug) => drug._id)},
                csrfToken, onEvent, controller.signal);
        } catch (error) {
            if (version !== streamVersion.current) return;
            setStreamAnswer('');
            setStreamSources([]);
            if (controller.signal.aborted || (error instanceof AgentStreamError && error.code === 'DISCONNECTED')) {
                setStreamPhase('disconnected');
            } else {
                if (error instanceof AgentStreamError && error.status === 401) dispatch(clearSession());
                setStreamError(error instanceof Error ? error.message : 'Unable to run the drug agent.');
                setStreamPhase('error');
            }
        } finally {
            if (streamController.current === controller) streamController.current = null;
        }
    };

    const handleAddDrug = (newDrug: Drug) => {
        resetAnswer();
        resetAgent();
        resetStream();
        setActiveDrugs((prev) => {
            if (prev.some((drug) => drug._id === newDrug._id)) return prev;
            return [...prev, newDrug];
        });
    };

    const handleRemoveDrug = (drugId: string) => {
        resetAnswer();
        resetAgent();
        resetStream();
        setActiveDrugs((prev) => prev.filter((drug) => drug._id !== drugId));
    };

    const activeDrugIds = new Set(activeDrugs.map((drug) => drug._id));
    const isStreaming = ['planning', 'using_tool', 'retrieving', 'generating'].includes(streamPhase);

    const visibleInteractions: Interaction[] = (interactionResponse?.interactions ?? []).filter(
        (interaction) =>
            activeDrugIds.has(interaction.drugA) &&
            activeDrugIds.has(interaction.drugB)
    );

    const highlightedDrugs = symptomSearchResult?.drugs ?? [];
    const highlightedInteractions = symptomSearchResult?.interactions ?? [];
    const activeDrugById = new Map(activeDrugs.map((drug) => [drug._id, drug]));
    const pubChemOnlyDrugNames = activeDrugs.filter(isPubChemOnlyDrug).map((drug) => drug.name);

    return (
        <div className={'m-6'}>
            <div>
                <label htmlFor="drug-search">Drugs:</label>
                <input
                    id="drug-search"
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
                        getDrugs(query, !searchResponse?.partial)
                        setSearchTerm('')
                    }}
                >{isLoading ? 'Searching...' : 'Search'}
                </button>
            </div>
            <div>
                <label htmlFor="symptom-search">Symptoms:</label>
                <input
                    id="symptom-search"
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
            </div>
            <List
                data={searchResults}
                onAdd={handleAddDrug}
                isLoading={isLoading}
                isError={isError}
                errorMessage={getApiErrorMessage(searchError, 'Unable to search drugs.')}
            />
            {searchResponse?.partial && (
                <p className="m-2 text-sm text-amber-800" role="status">
                    Some drug labels could not be processed. Results may be incomplete. Search again to retry.
                </p>
            )}
            {activeDrugs.length ? (
                <div className="m-2 flex flex-wrap gap-2">
                    {activeDrugs.map((drug) => (
                        <button
                            key={drug._id}
                            aria-label={`Remove ${drug.name}`}
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
                    resetStream();
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
                    disabled={isLoadingAgent || isStreaming || activeDrugs.length === 0 || activeDrugs.length > 4 || question.trim().length < 5}
                    onClick={() => {
                        resetAnswer();
                        resetStream();
                        askAgent({question: question.trim(), drugIds: activeDrugs.map((drug) => drug._id)});
                    }}
                >
                    {isLoadingAgent ? 'Using tools...' : 'Ask agent'}
                </button>
                <button
                    className="mt-2 ml-2 rounded-md border border-gray-300 px-3 py-2"
                    type="button"
                    disabled={isLoadingAgent || isStreaming || activeDrugs.length === 0 || activeDrugs.length > 4 || question.trim().length < 5}
                    onClick={startStream}
                >Stream agent</button>
                {isStreaming ? (
                    <button className="mt-2 ml-2 rounded-md border border-gray-300 px-3 py-2" type="button"
                            onClick={() => streamController.current?.abort()}>Stop streaming</button>
                ) : null}
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
            {streamPhase !== 'idle' ? (
                <p className="m-2 text-sm text-gray-700" role="status">
                    {STREAM_MESSAGES[streamPhase]}
                    {streamPhase === 'retrieving' && streamSourceCount > 0 ? ` ${streamSourceCount} passages found.` : ''}
                </p>
            ) : null}
            {streamError ? <p className="m-2 text-sm text-red-700" role="alert">{streamError}</p> : null}
            {ragResult && !isLoadingAnswer ? (
                <EvidenceAnswer title="Answer from FDA labels" answer={ragResult.answer} sources={ragResult.sources} pubChemOnlyDrugNames={pubChemOnlyDrugNames}/>
            ) : null}
            {agentResult && !isLoadingAgent ? (
                <EvidenceAnswer
                    title="Agent answer from FDA labels"
                    answer={agentResult.answer}
                    sources={agentResult.sources}
                    pubChemOnlyDrugNames={pubChemOnlyDrugNames}
                    toolCalls={agentResult.toolCalls}
                />
            ) : null}
            {(streamAnswer || streamResult) && streamPhase !== 'error' && streamPhase !== 'disconnected' ? (
                <EvidenceAnswer
                    title="Streaming agent answer from FDA labels"
                    answer={streamResult?.answer ?? streamAnswer}
                    sources={streamResult?.sources ?? streamSources}
                    pubChemOnlyDrugNames={pubChemOnlyDrugNames}
                    toolCalls={streamResult?.toolCalls}
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
