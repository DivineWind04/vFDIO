import { createAsyncThunk } from '@reduxjs/toolkit';

export const openWindowThunk = createAsyncThunk(
  'window/open',
  async (windowType: string) => {
    console.log('Opening window:', windowType);
    // Implementation for opening windows
    return windowType;
  }
);
