import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SectorState {
  artccId: string;
  sectorId: string;
}

const initialState: SectorState = {
  artccId: '',
  sectorId: '',
};

const sectorSlice = createSlice({
  name: 'sector',
  initialState,
  reducers: {
    setArtccId: (state, action: PayloadAction<string>) => {
      state.artccId = action.payload;
    },
    setSectorId: (state, action: PayloadAction<string>) => {
      state.sectorId = action.payload;
    },
  },
});

export const { setArtccId, setSectorId } = sectorSlice.actions;
export default sectorSlice.reducer;
