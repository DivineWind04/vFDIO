import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ApiFlightplan } from '../../types/apiTypes/apiFlightplan';
import type { RootState } from '../store';

export interface CustomFlightplanState {
  // Current flightplans data - using plain object instead of Map for Redux serialization
  flightplans: Record<string, ApiFlightplan>;
  
  // UI state
  selectedFlightplanId: string | null;
  viewMode: 'table' | 'detail' | 'stats';
  
  // Search and filter state
  lastSearchResults: ApiFlightplan[];
  searchCriteria: {
    aircraftId?: string;
    departure?: string;
    destination?: string;
    status?: ApiFlightplan['status'];
    altitude?: string;
    route?: string;
  };
  
  // Command history
  commandHistory: Array<{
    command: string;
    timestamp: number;
    result: string;
    success: boolean;
  }>;
  
  // Loading and error states
  isLoading: boolean;
  error: string | null;
}

const initialState: CustomFlightplanState = {
  flightplans: {},
  selectedFlightplanId: null,
  viewMode: 'table',
  lastSearchResults: [],
  searchCriteria: {},
  commandHistory: [],
  isLoading: false,
  error: null,
};

const customFlightplanSlice = createSlice({
  name: 'customFlightplan',
  initialState,
  reducers: {
    // Flightplan data management
    setFlightplans: (state, action: PayloadAction<Record<string, ApiFlightplan>>) => {
      // Payload is already a plain object
      state.flightplans = action.payload;
      state.error = null;
    },
    
    addFlightplan: (state, action: PayloadAction<ApiFlightplan>) => {
      state.flightplans[action.payload.aircraftId] = action.payload;
    },
    
    updateFlightplan: (state, action: PayloadAction<ApiFlightplan>) => {
      state.flightplans[action.payload.aircraftId] = action.payload;
    },
    
    removeFlightplan: (state, action: PayloadAction<string>) => {
      delete state.flightplans[action.payload];
      if (state.selectedFlightplanId === action.payload) {
        state.selectedFlightplanId = null;
      }
    },
    
    // UI state management
    setSelectedFlightplan: (state, action: PayloadAction<string | null>) => {
      state.selectedFlightplanId = action.payload;
    },
    
    setViewMode: (state, action: PayloadAction<'table' | 'detail' | 'stats'>) => {
      state.viewMode = action.payload;
    },
    
    // Search and filter management
    setSearchResults: (state, action: PayloadAction<ApiFlightplan[]>) => {
      state.lastSearchResults = action.payload;
    },
    
    setSearchCriteria: (state, action: PayloadAction<CustomFlightplanState['searchCriteria']>) => {
      state.searchCriteria = action.payload;
    },
    
    clearSearchResults: (state) => {
      state.lastSearchResults = [];
      state.searchCriteria = {};
    },
    
    // Command history management
    addCommandToHistory: (state, action: PayloadAction<{
      command: string;
      result: string;
      success: boolean;
    }>) => {
      const entry = {
        ...action.payload,
        timestamp: Date.now(),
      };
      
      state.commandHistory.unshift(entry);
      
      // Keep only last 50 commands
      if (state.commandHistory.length > 50) {
        state.commandHistory = state.commandHistory.slice(0, 50);
      }
    },
    
    clearCommandHistory: (state) => {
      state.commandHistory = [];
    },
    
    // Loading and error states
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setFlightplans,
  addFlightplan,
  updateFlightplan,
  removeFlightplan,
  setSelectedFlightplan,
  setViewMode,
  setSearchResults,
  setSearchCriteria,
  clearSearchResults,
  addCommandToHistory,
  clearCommandHistory,
  setLoading,
  setError,
  clearError,
} = customFlightplanSlice.actions;

// Selectors
export const selectFlightplans = (state: RootState) => state.customFlightplan.flightplans;
export const selectFlightplansArray = (state: RootState) => 
  Object.values(state.customFlightplan.flightplans);
export const selectSelectedFlightplan = (state: RootState) => {
  const id = state.customFlightplan.selectedFlightplanId;
  return id ? state.customFlightplan.flightplans[id] : null;
};
export const selectViewMode = (state: RootState) => state.customFlightplan.viewMode;
export const selectSearchResults = (state: RootState) => state.customFlightplan.lastSearchResults;
export const selectSearchCriteria = (state: RootState) => state.customFlightplan.searchCriteria;
export const selectCommandHistory = (state: RootState) => state.customFlightplan.commandHistory;
export const selectIsLoading = (state: RootState) => state.customFlightplan.isLoading;
export const selectError = (state: RootState) => state.customFlightplan.error;

// Complex selectors
export const selectFlightplanById = (state: RootState, aircraftId: string) =>
  state.customFlightplan.flightplans[aircraftId];

export const selectFlightplansByStatus = (state: RootState, status: ApiFlightplan['status']) =>
  Object.values(state.customFlightplan.flightplans).filter((fp: ApiFlightplan) => fp.status === status);

export const selectFlightplanStatistics = (state: RootState) => {
  const flightplans = Object.values(state.customFlightplan.flightplans);
  
  const stats = {
    total: flightplans.length,
    byStatus: {
      Active: 0,
      Proposed: 0,
      Tentative: 0,
    },
    byEquipmentType: new Map<string, number>(),
    averageSpeed: 0,
    altitudeDistribution: new Map<string, number>(),
  };

  let totalSpeed = 0;

  flightplans.forEach((fp: ApiFlightplan) => {
    stats.byStatus[fp.status]++;
    
    const currentCount = stats.byEquipmentType.get(fp.aircraftType) || 0;
    stats.byEquipmentType.set(fp.aircraftType, currentCount + 1);
    
    totalSpeed += fp.speed;
    
    const altCount = stats.altitudeDistribution.get(fp.altitude) || 0;
    stats.altitudeDistribution.set(fp.altitude, altCount + 1);
  });

  stats.averageSpeed = flightplans.length > 0 ? Math.round(totalSpeed / flightplans.length) : 0;

  return stats;
};

export default customFlightplanSlice.reducer;