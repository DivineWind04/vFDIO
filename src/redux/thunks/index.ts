import { createAsyncThunk } from '@reduxjs/toolkit';
import type { ApiFlightplan } from '../../types/apiTypes';

export const updateFlightplanThunk = createAsyncThunk(
  'flightplan/update',
  async (flightplan: ApiFlightplan) => {
    return flightplan;
  }
);

export const deleteFlightplanThunk = createAsyncThunk(
  'flightplan/delete',
  async (flightplanId: string) => {
    return flightplanId;
  }
);

export const initThunk = createAsyncThunk(
  'app/init',
  async () => {
    return true;
  }
);
