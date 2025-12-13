import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OutageEntry } from '../../types/outageEntry';

interface AppState {
  fsdIsConnected: boolean;
  outageMessages: OutageEntry[];
}

const initialState: AppState = {
  fsdIsConnected: false,
  outageMessages: [],
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setFsdIsConnected: (state, action: PayloadAction<boolean>) => {
      state.fsdIsConnected = action.payload;
    },
    addOutageMessage: (state, action: PayloadAction<OutageEntry>) => {
      state.outageMessages.push(action.payload);
    },
    delOutageMessage: (state, action: PayloadAction<string>) => {
      state.outageMessages = state.outageMessages.filter(msg => msg.id !== action.payload);
    },
  },
});

export const { setFsdIsConnected, addOutageMessage, delOutageMessage } = appSlice.actions;
export default appSlice.reducer;
