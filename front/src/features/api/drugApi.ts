import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";
import type {CheckInteractionsRequest, Drug, Interaction, SymptomSearchRequest} from "../../utils/types";

export const drugApi = createApi({
    reducerPath: 'drugApi',
    baseQuery: fetchBaseQuery({baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}),
    endpoints: builder => ({
        getDrugs: builder.query<Drug[], string>({
            query: (text) => ({
                url: '/search',
                method: 'POST',
                body: {text}
            })
        }),
        getInteractions: builder.query<Interaction[], CheckInteractionsRequest>({
            query: (body) => ({
                url: '/interactions/check',
                method: 'POST',
                body
            })
        }),
        searchBySymptoms: builder.mutation<Drug[], SymptomSearchRequest>({
            query: (body) => ({
                url: '/search/symptom',
                method: 'POST',
                body
            })
        }),
    })
})

export const {useLazyGetDrugsQuery, useLazyGetInteractionsQuery, useSearchBySymptomsMutation} = drugApi;