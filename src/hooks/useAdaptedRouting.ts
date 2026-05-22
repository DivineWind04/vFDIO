/**
 * useAdaptedRouting Hook
 * React hook for accessing adapted routing functionality
 * Similar to EDST's useAar, useAdr, useAdar hooks
 */

import { useCallback, useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../redux/store";
import {
  selectIsInitialized,
  selectIsLoading,
  selectError,
  selectCachedRoutes,
  selectIsCacheValid,
  selectArtccId,
  selectXmlBasePath,
  selectActiveRouteGroups,
  selectShowEligibleOnly,
  setInitialized,
  setLoading,
  setError,
  cacheRoutesForAircraft,
  clearCacheForAircraft,
} from "../redux/slices/adaptedRoutingSlice";
import {
  adaptedRoutingsService,
  AdaptedRoutingsService,
  computeAmendedRoute,
  buildConcatenatedRoute,
  type RouteAmendmentResult,
} from "../services/adaptedRoutingService";
import type {
  FlightDataRecord,
  ApiAdaptedDepartureArrivalRoute,
  ApiAdaptedDepartureRoute,
  ApiAdaptedArrivalRoute,
  ATCRoute,
  EdstAdaptedRoute,
} from "../types/adaptedRouting";
import type { ApiFlightplan, CreateOrAmendFlightplanDto } from "../types/apiTypes/apiFlightplan";
import { HubContext } from "../contexts/HubContext";

/**
 * Convert ApiFlightplan to FlightDataRecord for route analysis
 */
function flightplanToFdr(fp: ApiFlightplan): FlightDataRecord {
  return {
    callsign: fp.aircraftId,
    aircraftType: fp.aircraftType,
    departure: fp.departure,
    destination: fp.destination,
    route: fp.route,
    altitude: fp.altitude,
    remarks: fp.remarks,
    equipment: fp.icaoEquipmentCodes ?? fp.faaEquipmentSuffix ?? "",
    status: fp.status,
    parsedRoute: [], // Would need route parser for full implementation
  };
}

/**
 * Initialize the adapted routing service
 */
export function useInitializeAdaptedRouting() {
  const dispatch = useDispatch<AppDispatch>();
  const isInitialized = useSelector(selectIsInitialized);
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectError);
  const artccId = useSelector(selectArtccId);
  const xmlBasePath = useSelector(selectXmlBasePath);

  const initialize = useCallback(async () => {
    if (isLoading) return;

    dispatch(setLoading(true));
    try {
      await adaptedRoutingsService.initialize(xmlBasePath, artccId);
      dispatch(setInitialized(true));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to initialize adapted routing";
      dispatch(setError(message));
    }
  }, [dispatch, artccId, xmlBasePath, isLoading]);

  return {
    initialize,
    isInitialized,
    isLoading,
    error,
  };
}

/**
 * Get adapted routes for a specific aircraft/flightplan
 */
export function useAdaptedRoutes(flightplan: ApiFlightplan | null) {
  const dispatch = useDispatch<AppDispatch>();
  const isInitialized = useSelector(selectIsInitialized);
  const activeRouteGroups = useSelector(selectActiveRouteGroups);
  const showEligibleOnly = useSelector(selectShowEligibleOnly);

  const aircraftId = flightplan?.aircraftId ?? "";
  const cachedRoutes = useSelector((state: RootState) =>
    selectCachedRoutes(state, aircraftId)
  );
  const isCacheValid = useSelector((state: RootState) =>
    selectIsCacheValid(state, aircraftId)
  );

  const [loading, setLocalLoading] = useState(false);
  const [adar, setAdar] = useState<ApiAdaptedDepartureArrivalRoute[]>([]);
  const [adr, setAdr] = useState<ApiAdaptedDepartureRoute[]>([]);
  const [aar, setAar] = useState<ApiAdaptedArrivalRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<ATCRoute | null>(null);

  useEffect(() => {
    if (!flightplan || !isInitialized) {
      return;
    }

    // Use cache if valid
    if (cachedRoutes && isCacheValid) {
      setAdar(cachedRoutes.adar);
      setAdr(cachedRoutes.adr);
      setAar(cachedRoutes.aar);
      setSelectedRoute(cachedRoutes.selectedRoute);
      return;
    }

    // Fetch fresh routes
    const fetchRoutes = async () => {
      setLocalLoading(true);
      try {
        const fdr = flightplanToFdr(flightplan);
        const routeGroup = activeRouteGroups[0] ?? "ZOA";
        const result = await adaptedRoutingsService.getRoutesForFlight(fdr, [routeGroup]);

        setAdar(result.adar);
        setAdr(result.adr);
        setAar(result.aar);
        setSelectedRoute(result.selectedRoute);

        // Cache the results
        dispatch(
          cacheRoutesForAircraft({
            aircraftId: flightplan.aircraftId,
            adar: result.adar,
            adr: result.adr,
            aar: result.aar,
            selectedRoute: result.selectedRoute,
          })
        );
      } catch (err) {
        console.error("Error fetching adapted routes:", err);
      } finally {
        setLocalLoading(false);
      }
    };

    fetchRoutes();
  }, [
    flightplan,
    isInitialized,
    activeRouteGroups,
    cachedRoutes,
    isCacheValid,
    dispatch,
  ]);

  // Filter eligible only if configured
  const filteredAdar = showEligibleOnly ? adar.filter((r) => r.eligible) : adar;
  const filteredAdr = showEligibleOnly ? adr.filter((r) => r.eligible) : adr;
  const filteredAar = showEligibleOnly ? aar.filter((r) => r.eligible) : aar;

  return {
    adar: filteredAdar,
    adr: filteredAdr,
    aar: filteredAar,
    selectedRoute,
    loading,
    isInitialized,
  };
}

/**
 * Hook for AAR (Adapted Arrival Routes) only - matches EDST pattern
 */
export function useAar(flightplan: ApiFlightplan | null): ApiAdaptedArrivalRoute[] {
  const { aar } = useAdaptedRoutes(flightplan);
  return aar;
}

/**
 * Hook for ADR (Adapted Departure Routes) only - matches EDST pattern
 */
export function useAdr(flightplan: ApiFlightplan | null): ApiAdaptedDepartureRoute[] {
  const { adr } = useAdaptedRoutes(flightplan);
  return adr;
}

/**
 * Hook for ADAR (Adapted Departure Arrival Routes) only - matches EDST pattern
 */
export function useAdar(flightplan: ApiFlightplan | null): ApiAdaptedDepartureArrivalRoute[] {
  const { adar } = useAdaptedRoutes(flightplan);
  return adar;
}

/**
 * Compute combined route list in display format - matches EDST computeRouteList
 */
export function computeRouteList(
  aar: ApiAdaptedArrivalRoute[],
  adr: ApiAdaptedDepartureRoute[],
  adar: ApiAdaptedDepartureArrivalRoute[]
): EdstAdaptedRoute[] {
  return (adar.map((r) => ({ ...r, routeType: "adar" as const })) as EdstAdaptedRoute[])
    .concat(adr.map((r) => ({ ...r, routeType: "adr" as const })))
    .concat(aar.map((r) => ({ ...r, routeType: "aar" as const })));
}

/**
 * Hook to get all routes in display format
 */
export function useRouteDisplay(flightplan: ApiFlightplan | null) {
  const { adar, adr, aar, selectedRoute, loading, isInitialized } = useAdaptedRoutes(flightplan);
  const showEligibleOnly = useSelector(selectShowEligibleOnly);

  const routes = computeRouteList(aar, adr, adar);
  const eligibleRoutes = routes.filter((r) => r.eligible);

  return {
    routes,
    eligibleRoutes,
    displayRoutes: showEligibleOnly ? eligibleRoutes : routes,
    selectedRoute,
    loading,
    isInitialized,
  };
}

/**
 * Hook to refresh routes for an aircraft (clear cache and refetch)
 */
export function useRefreshRoutes() {
  const dispatch = useDispatch<AppDispatch>();

  const refresh = useCallback(
    (aircraftId: string) => {
      dispatch(clearCacheForAircraft(aircraftId));
    },
    [dispatch]
  );

  return refresh;
}

/**
 * Hook to amend a flightplan with the selected adapted route
 * Concatenates the preferred route with the current route
 */
export function useAmendWithPreferredRoute() {
  const hubContext = useContext(HubContext);
  const refreshRoutes = useRefreshRoutes();
  const [isAmending, setIsAmending] = useState(false);
  const [lastAmendResult, setLastAmendResult] = useState<RouteAmendmentResult | null>(null);

  const amendWithRoute = useCallback(
    async (
      flightplan: ApiFlightplan,
      selectedRoute: ATCRoute
    ): Promise<RouteAmendmentResult> => {
      if (!hubContext) {
        throw new Error("Hub context not available");
      }

      setIsAmending(true);

      try {
        // Compute the new route
        const result = computeAmendedRoute(flightplan.route, selectedRoute);
        setLastAmendResult(result);

        if (!result.needsAmendment) {
          console.log("Route already contains adapted route, no amendment needed");
          return result;
        }

        // Build the amendment DTO
        const amendDto: CreateOrAmendFlightplanDto = {
          aircraftId: flightplan.aircraftId,
          cid: flightplan.cid,
          status: flightplan.status,
          assignedBeaconCode: flightplan.assignedBeaconCode,
          equipment: flightplan.equipment,
          aircraftType: flightplan.aircraftType,
          icaoEquipmentCodes: flightplan.icaoEquipmentCodes,
          icaoSurveillanceCodes: flightplan.icaoSurveillanceCodes,
          faaEquipmentSuffix: flightplan.faaEquipmentSuffix,
          speed: flightplan.speed,
          altitude: flightplan.altitude,
          departure: flightplan.departure,
          destination: flightplan.destination,
          alternate: flightplan.alternate,
          route: result.newRoute, // The amended route!
          estimatedDepartureTime: flightplan.estimatedDepartureTime,
          actualDepartureTime: flightplan.actualDepartureTime,
          fuelHours: flightplan.fuelHours,
          fuelMinutes: flightplan.fuelMinutes,
          hoursEnroute: flightplan.hoursEnroute,
          minutesEnroute: flightplan.minutesEnroute,
          pilotCid: flightplan.pilotCid,
          remarks: flightplan.remarks,
          holdAnnotations: flightplan.holdAnnotations,
          wakeTurbulenceCode: flightplan.wakeTurbulenceCode,
        };

        console.log(
          `Amending ${flightplan.aircraftId} with ${result.routeType} route ${result.routeId}`
        );
        console.log(`New route: ${result.newRoute}`);

        // Send the amendment via hub
        await hubContext.amendFlightplan(amendDto);

        // Clear the route cache for this aircraft so it re-fetches
        refreshRoutes(flightplan.aircraftId);

        return result;
      } finally {
        setIsAmending(false);
      }
    },
    [hubContext, refreshRoutes]
  );

  /**
   * Quick amend using the best selected route from the service
   */
  const quickAmendWithBestRoute = useCallback(
    async (flightplan: ApiFlightplan): Promise<RouteAmendmentResult | null> => {
      const fdr: FlightDataRecord = {
        callsign: flightplan.aircraftId,
        aircraftType: flightplan.aircraftType,
        departure: flightplan.departure,
        destination: flightplan.destination,
        route: flightplan.route,
        altitude: flightplan.altitude,
        remarks: flightplan.remarks,
        equipment: flightplan.icaoEquipmentCodes ?? flightplan.faaEquipmentSuffix ?? "",
        status: flightplan.status,
        parsedRoute: [],
      };

      const result = await adaptedRoutingsService.getRoutesForFlight(fdr, ["ZOA"]);

      if (
        !result.selectedRoute.selectedDepartureArrival &&
        !result.selectedRoute.selectedDeparture &&
        !result.selectedRoute.selectedArrival
      ) {
        console.log("No applicable adapted routes found");
        return null;
      }

      return amendWithRoute(flightplan, result.selectedRoute);
    },
    [amendWithRoute]
  );

  return {
    amendWithRoute,
    quickAmendWithBestRoute,
    isAmending,
    lastAmendResult,
  };
}

/**
 * Hook to get the preview of how a route would be amended
 * (without actually performing the amendment)
 */
export function useRouteAmendmentPreview(
  flightplan: ApiFlightplan | null,
  selectedRoute: ATCRoute | null
): RouteAmendmentResult | null {
  const [preview, setPreview] = useState<RouteAmendmentResult | null>(null);

  useEffect(() => {
    if (!flightplan || !selectedRoute) {
      setPreview(null);
      return;
    }

    const result = computeAmendedRoute(flightplan.route, selectedRoute);
    setPreview(result);
  }, [flightplan, selectedRoute]);

  return preview;
}
