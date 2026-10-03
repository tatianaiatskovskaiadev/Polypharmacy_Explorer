import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";
import type {
    CheckInteractionsRequest,
    CheckInteractionsResponse,
    Drug,
    RagAnswerRequest,
    RagAnswerResponse,
    SymptomSearchRequest,
    SymptomSearchResponse
} from "../../utils/types";

const DEMO_API_KEY_HEADER = 'x-demo-api-key';

export const drugApi = createApi({
    reducerPath: 'drugApi',
    baseQuery: fetchBaseQuery({
        baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
        prepareHeaders: (headers) => {
            const demoApiKey = import.meta.env.VITE_DEMO_API_KEY;
            if (demoApiKey) {
                headers.set(DEMO_API_KEY_HEADER, demoApiKey);
            }
            return headers;
        }
    }),
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
    })
})

export const {
    useLazyGetDrugsQuery,
    useLazyGetInteractionsQuery,
    useSearchBySymptomsMutation,
    useAnswerQuestionMutation
} = drugApi;
