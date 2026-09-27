import {createSlice, type PayloadAction} from "@reduxjs/toolkit";

type WindowState = {
    isVisible: boolean;
    x: number;
    y: number;
}

const initialState: WindowState = {
    isVisible: false,
    x: 0,
    y: 0,
}

const windowSlice = createSlice({
    name: 'window',
    initialState,
    reducers: {
        close: (state) => {
            state.isVisible = false;
        },
        open: (state, action: PayloadAction<{x: number; y: number}>) => {
            const {x, y} = action.payload;
            state.isVisible = true;
            state.x = x;
            state.y = y;
        },
    },
})

export default windowSlice.reducer;
export const { close, open } = windowSlice.actions;
