import {configureStore} from "@reduxjs/toolkit";
import {setupListeners} from "@reduxjs/toolkit/query";
import {drugApi} from "../features/api/drugApi.ts";
import window from "../features/window/windowSlice"
import auth from "../features/auth/authSlice.ts";

export const store = configureStore({
    reducer: {
        [drugApi.reducerPath]: drugApi.reducer,
        window,
        auth
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(drugApi.middleware)
})

setupListeners(store.dispatch)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
