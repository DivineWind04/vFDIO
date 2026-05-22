import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../store";
import type {
  AdaptedRoutingData,
  ApiAdaptedDepartureArrivalRoute,
  ApiAdaptedDepartureRoute,
  ApiAdaptedArrivalRoute,
  ATCRoute,
} from "../../types/adaptedRouting";

export interface AdaptedRoutingState {
  // Initialization state
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Current ARTCC
  artccId: string;

  // Base path for XML files
  xmlBasePath: string;

  // Route Groups to use for filtering
  activeRouteGroups: string[];

  // Active SA configuration name (e.g. "APWW17")
  activeConfiguration: string | null;

  // Cached route results per aircraft
  routeCache: Record<
    string,
    {
      adar: ApiAdaptedDepartureArrivalRoute[];
      adr: ApiAdaptedDepartureRoute[];
      aar: ApiAdaptedArrivalRoute[];
      selectedRoute: ATCRoute | null;
      timestamp: number;
    }
  >;

  // Configuration
  config: {
    cacheExpirationMs: number;
    enableAutoRefresh: boolean;
    showEligibleOnly: boolean;
  };
}

const initialState: AdaptedRoutingState = {
  isInitialized: false,
  isLoading: false,
  error: null,
  artccId: "ZOA",
  xmlBasePath: "/api/adaptations",
  activeRouteGroups: ["ZOA"],
  activeConfiguration: null,
  routeCache: {},
  config: {
    cacheExpirationMs: 5 * 60 * 1000, // 5 minutes
    enableAutoRefresh: true,
    showEligibleOnly: true,
  },
};

const adaptedRoutingSlice = createSlice({
  name: "adaptedRouting",
  initialState,
  reducers: {
    // Initialization actions
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },

    // Configuration actions
    setArtccId: (state, action: PayloadAction<string>) => {
      state.artccId = action.payload;
      // Clear cache when ARTCC changes
      state.routeCache = {};
      state.isInitialized = false;
    },

    setXmlBasePath: (state, action: PayloadAction<string>) => {
      state.xmlBasePath = action.payload;
      state.isInitialized = false;
    },

    setActiveRouteGroups: (state, action: PayloadAction<string[]>) => {
      state.activeRouteGroups = action.payload;
      // Clear cache when route groups change
      state.routeCache = {};
    },

    setActiveConfiguration: (state, action: PayloadAction<string | null>) => {
      state.activeConfiguration = action.payload;
    },

    setShowEligibleOnly: (state, action: PayloadAction<boolean>) => {
      state.config.showEligibleOnly = action.payload;
    },

    // Cache management
    cacheRoutesForAircraft: (
      state,
      action: PayloadAction<{
        aircraftId: string;
        adar: ApiAdaptedDepartureArrivalRoute[];
        adr: ApiAdaptedDepartureRoute[];
        aar: ApiAdaptedArrivalRoute[];
        selectedRoute: ATCRoute | null;
      }>
    ) => {
      const { aircraftId, adar, adr, aar, selectedRoute } = action.payload;
      state.routeCache[aircraftId] = {
        adar,
        adr,
        aar,
        selectedRoute,
        timestamp: Date.now(),
      };
    },

    clearCacheForAircraft: (state, action: PayloadAction<string>) => {
      delete state.routeCache[action.payload];
    },

    clearAllCache: (state) => {
      state.routeCache = {};
    },

    // Clean up expired cache entries
    cleanExpiredCache: (state) => {
      const now = Date.now();
      const expiration = state.config.cacheExpirationMs;
      Object.keys(state.routeCache).forEach((key) => {
        if (now - state.routeCache[key].timestamp > expiration) {
          delete state.routeCache[key];
        }
      });
    },
  },
});

// Actions
export const {
  setInitialized,
  setLoading,
  setError,
  setArtccId,
  setXmlBasePath,
  setActiveRouteGroups,
  setActiveConfiguration,
  setShowEligibleOnly,
  cacheRoutesForAircraft,
  clearCacheForAircraft,
  clearAllCache,
  cleanExpiredCache,
} = adaptedRoutingSlice.actions;

// Selectors
export const selectIsInitialized = (state: RootState) =>
  state.adaptedRouting.isInitialized;

export const selectIsLoading = (state: RootState) =>
  state.adaptedRouting.isLoading;

export const selectError = (state: RootState) => state.adaptedRouting.error;

export const selectArtccId = (state: RootState) =>
  state.adaptedRouting.artccId;

export const selectXmlBasePath = (state: RootState) =>
  state.adaptedRouting.xmlBasePath;

export const selectActiveRouteGroups = (state: RootState) =>
  state.adaptedRouting.activeRouteGroups;

export const selectActiveConfiguration = (state: RootState) =>
  state.adaptedRouting.activeConfiguration;

export const selectShowEligibleOnly = (state: RootState) =>
  state.adaptedRouting.config.showEligibleOnly;

export const selectCachedRoutes = (state: RootState, aircraftId: string) =>
  state.adaptedRouting.routeCache[aircraftId];

export const selectIsCacheValid = (
  state: RootState,
  aircraftId: string
): boolean => {
  const cached = state.adaptedRouting.routeCache[aircraftId];
  if (!cached) return false;
  const now = Date.now();
  return now - cached.timestamp < state.adaptedRouting.config.cacheExpirationMs;
};

export default adaptedRoutingSlice.reducer;
