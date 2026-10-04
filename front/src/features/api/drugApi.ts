import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";
import type {
    AgentAnswerResponse,
    CheckInteractionsRequest,
    CheckInteractionsResponse,
    Drug,
    RagAnswerRequest,
    RagAnswerResponse,
    SymptomSearchRequest,
    SymptomSearchResponse
} from "../../utils/types";
import {clearSession, type AuthSession} from '../auth/authSlice.ts';

const rawBaseQuery = fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
    credentials: 'include',
    prepareHeaders: (headers, {getState}) => {
        const session = (getState() as {auth: AuthSession | null}).auth;
        if (session?.csrfToken) {
            headers.set('x-csrf-token', session.csrfToken);
        }
        return headers;
    }
});

const baseQuery: typeof rawBaseQuery = async (args, api, extraOptions) => {
    const result = await rawBaseQuery(args, api, extraOptions);
    if (result.error?.status === 401) api.dispatch(clearSession());
    return result;
};

export const drugApi = createApi({
    reducerPath: 'drugApi',
    baseQuery,
    endpoints: builder => ({
        getDrugs: builder.query<Drug[], string>({
            query: (text) => ({
                url: '/search',
                method: 'POST',
                body: {text}
            })
        }),
        getInteractions: builder.query<CheckInteractionsResponse, CheckInteractionsRequest>({
            query: (body) => ({
                url: '/interactions/check',
                method: 'POST',
                body
            })
        }),
        searchBySymptoms: builder.mutation<SymptomSearchResponse, SymptomSearchRequest>({
            query: (body) => ({
                url: '/search/symptom',
                method: 'POST',
                body
            })
        }),
        answerQuestion: builder.mutation<RagAnswerResponse, RagAnswerRequest>({
            query: (body) => ({
                url: '/rag/answer',
                method: 'POST',
                body
            })
        }),
        askAgent: builder.mutation<AgentAnswerResponse, RagAnswerRequest>({
            query: (body) => ({
                url: '/agent/ask',
                method: 'POST',
                body
            })
        }),
    })
})

export const {
    useLazyGetDrugsQuery,
    useLazyGetInteractionsQuery,
    useSearchBySymptomsMutation,
    useAnswerQuestionMutation,
    useAskAgentMutation
} = drugApi;
