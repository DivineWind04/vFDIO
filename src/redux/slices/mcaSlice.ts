import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface McaState {
  acceptMessage: string;
  rejectMessage: string;
  responseMessage: string;
}

const initialState: McaState = {
  acceptMessage: '',
  rejectMessage: '',
  responseMessage: '',
};

const mcaSlice = createSlice({
  name: 'mca',
  initialState,
  reducers: {
    setMcaAcceptMessage: (state, action: PayloadAction<string>) => {
      state.acceptMessage = action.payload;
    },
    setMcaRejectMessage: (state, action: PayloadAction<string>) => {
      state.rejectMessage = action.payload;
    },
    setMraMessage: (state, action: PayloadAction<string>) => {
      state.responseMessage = action.payload;
    },
  },
});

export const { setMcaAcceptMessage, setMcaRejectMessage, setMraMessage } = mcaSlice.actions;
export default mcaSlice.reducer;
