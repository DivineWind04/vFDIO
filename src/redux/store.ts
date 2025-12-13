import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import appReducer from './slices/appSlice';
import sectorReducer from './slices/sectorSlice';
import mcaReducer from './slices/mcaSlice';
import customFlightplanReducer from './slices/customFlightplanSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    app: appReducer,
    sector: sectorReducer,
    mca: mcaReducer,
    customFlightplan: customFlightplanReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
