import {createSlice, type PayloadAction} from '@reduxjs/toolkit';

export type AuthSession = {
    user: {id: string; email: string; emailVerified: boolean};
    csrfToken: string;
};

const authSlice = createSlice({
    name: 'auth',
    initialState: null as AuthSession | null,
    reducers: {
        setSession: (_state, action: PayloadAction<AuthSession>) => action.payload,
        clearSession: () => null
    }
});

export const {setSession, clearSession} = authSlice.actions;
export default authSlice.reducer;
