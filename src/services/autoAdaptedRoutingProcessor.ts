import type { ApiFlightplan, CreateOrAmendFlightplanDto } from '../types/apiTypes/apiFlightplan';
import type { ATCRoute, FlightDataRecord } from '../types/adaptedRouting/adaptedRoute';
import {
  adaptedRoutingsService,
  computeAmendedRoute,
} from './adaptedRoutingService';
import type { RouteAmendmentResult } from './adaptedRoutingService';
import { CustomFlightplanService } from './customFlightplanService';

export interface ProcessingResult {
  aircraftId: string;
  originalRoute: string;
  newRoute: string;
  routeType: 'adar' | 'adr' | 'aar';
  routeId: string;
  success: boolean;
  error?: string;
}

export interface ProcessingStats {
  totalProcessed: number;
  amended: number;
  skipped: number;
  errors: number;
  results: ProcessingResult[];
}

// Re-export for convenience
export type { RouteAmendmentResult };

/**
 * Convert ApiFlightplan to FlightDataRecord format for the routing service
 */
function flightplanToFdr(fp: ApiFlightplan): FlightDataRecord {
  return {
    callsign: fp.aircraftId,
    departure: fp.departure,
    destination: fp.destination,
    route: fp.route,
    altitude: fp.altitude,
    aircraftType: fp.aircraftType,
    equipment: fp.icaoEquipmentCodes,
    remarks: fp.remarks || '',
    status: fp.status,
    // Tokenise the raw route string so geographic transition-fix checks work
    parsedRoute: (fp.route || '').split(/[\s./]+/).filter(Boolean).map(name => ({ type: 'WAYPOINT' as const, name, distance: 0 })),
  };
}

/**
 * Build CreateOrAmendFlightplanDto from flightplan with new route
 */
export function buildAmendDto(fp: ApiFlightplan, newRoute: string): CreateOrAmendFlightplanDto {
  return {
    aircraftId: fp.aircraftId,
    cid: fp.cid,
    status: fp.status,
    assignedBeaconCode: fp.assignedBeaconCode,
    equipment: fp.equipment,
    aircraftType: fp.aircraftType,
    icaoEquipmentCodes: fp.icaoEquipmentCodes,
    icaoSurveillanceCodes: fp.icaoSurveillanceCodes,
    faaEquipmentSuffix: fp.faaEquipmentSuffix,
    speed: fp.speed,
    altitude: fp.altitude,
    departure: fp.departure,
    destination: fp.destination,
    alternate: fp.alternate,
    route: newRoute,
    estimatedDepartureTime: fp.estimatedDepartureTime,
    actualDepartureTime: fp.actualDepartureTime,
    fuelHours: fp.fuelHours,
    fuelMinutes: fp.fuelMinutes,
    hoursEnroute: fp.hoursEnroute,
    minutesEnroute: fp.minutesEnroute,
    pilotCid: fp.pilotCid,
    remarks: fp.remarks,
    holdAnnotations: fp.holdAnnotations,
    wakeTurbulenceCode: fp.wakeTurbulenceCode
  };
}

/**
 * Process a single flightplan and find the best adapted route
 * Priority: ADAR > ADR > AAR
 */
export async function findBestRouteForFlightplan(
  flightplan: ApiFlightplan,
  activeGroups: string[] = []
): Promise<RouteAmendmentResult | null> {
  if (!adaptedRoutingsService.isInitialized()) {
    console.warn(`[AutoRouting] ${flightplan.aircraftId}: service not initialized, skipping`);
    return null;
  }

  const fdr = flightplanToFdr(flightplan);

  // Skip flights whose route already has an adapted block — never re-adapt automatically.
  if ((flightplan.route || '').includes('+')) {
    console.log(`[AutoRouting] ${flightplan.aircraftId}: skipping — route already adapted (use RM to re-match)`);
    return null;
  }

  console.log(`[AutoRouting] ${flightplan.aircraftId}: checking routes | dep=${fdr.departure} dest=${fdr.destination} type=${fdr.aircraftType} equip=${fdr.equipment} alt=${fdr.altitude} route="${fdr.route}" activeGroups=[${activeGroups.join(',')}]`);

  // Try ADAR first (highest priority - full departure/arrival route)
  const adarRoutes = await adaptedRoutingsService.findApplicableAdar(fdr, activeGroups);
  console.log(`[AutoRouting] ${flightplan.aircraftId}: ADAR candidates=${adarRoutes.length}`, adarRoutes.map(r => r.routeId));

  if (adarRoutes.length > 0) {
    const bestAdar = adarRoutes[0]; // Already sorted by order/priority
    const atcRoute: ATCRoute = {
      selectedDepartureArrival: bestAdar,
      selectedDeparture: null,
      selectedArrival: null
    };
    const result = computeAmendedRoute(flightplan.route, atcRoute);
    console.log(`[AutoRouting] ${flightplan.aircraftId}: ADAR "${bestAdar.routeId}" needsAmendment=${result.needsAmendment} newRoute="${result.newRoute}"`);
    if (result.needsAmendment) {
      return result;
    }
  }

  // Try ADR (departure routes)
  const adrRoutes = await adaptedRoutingsService.findApplicableAdr(fdr, activeGroups);
  console.log(`[AutoRouting] ${flightplan.aircraftId}: ADR candidates=${adrRoutes.length}`, adrRoutes.map(r => r.routeId));

  if (adrRoutes.length > 0) {
    const bestAdr = adrRoutes[0];
    const atcRoute: ATCRoute = {
      selectedDepartureArrival: null,
      selectedDeparture: bestAdr,
      selectedArrival: null
    };
    const result = computeAmendedRoute(flightplan.route, atcRoute);
    console.log(`[AutoRouting] ${flightplan.aircraftId}: ADR "${bestAdr.routeId}" needsAmendment=${result.needsAmendment} newRoute="${result.newRoute}"`);
    if (result.needsAmendment) {
      return result;
    }
  }

  // Try AAR (arrival routes) — only for active (airborne) flights, not proposals/departures
  if (flightplan.status !== 'Active') {
    console.log(`[AutoRouting] ${flightplan.aircraftId}: skipping AAR (status=${flightplan.status})`);
    return null;
  }
  const aarRoutes = await adaptedRoutingsService.findApplicableAar(fdr, activeGroups);
  console.log(`[AutoRouting] ${flightplan.aircraftId}: AAR candidates=${aarRoutes.length}`, aarRoutes.map(r => r.routeId));

  if (aarRoutes.length > 0) {
    const bestAar = aarRoutes[0];
    const atcRoute: ATCRoute = {
      selectedDepartureArrival: null,
      selectedDeparture: null,
      selectedArrival: bestAar
    };
    const result = computeAmendedRoute(flightplan.route, atcRoute);
    console.log(`[AutoRouting] ${flightplan.aircraftId}: AAR "${bestAar.routeId}" needsAmendment=${result.needsAmendment} newRoute="${result.newRoute}"`);
    if (result.needsAmendment) {
      return result;
    }
  }

  console.log(`[AutoRouting] ${flightplan.aircraftId}: no amendment needed`);
  return null;
}

/**
 * Process all flightplans from the service and amend them with adapted routes
 */
export async function processAllFlightplans(
  flightplanService: CustomFlightplanService,
  amendFlightplan: (dto: CreateOrAmendFlightplanDto) => Promise<void>,
  activeGroups: string[] = []
): Promise<ProcessingStats> {
  const stats: ProcessingStats = {
    totalProcessed: 0,
    amended: 0,
    skipped: 0,
    errors: 0,
    results: []
  };
  
  const allFlightplans = flightplanService.getAllFlightplans();
  
  for (const fp of allFlightplans) {
    stats.totalProcessed++;
    
    try {
      const amendmentResult = await findBestRouteForFlightplan(fp, activeGroups);
      
      if (amendmentResult && amendmentResult.needsAmendment) {
        const routeToAmend = fp.status === 'Active' ? amendmentResult.newRoute : amendmentResult.stripRoute;
        const dto = buildAmendDto(fp, routeToAmend);
        await amendFlightplan(dto);

        stats.amended++;
        stats.results.push({
          aircraftId: fp.aircraftId,
          originalRoute: fp.route,
          newRoute: routeToAmend,
          routeType: amendmentResult.routeType!,
          routeId: amendmentResult.routeId!,
          success: true
        });
      } else {
        stats.skipped++;
      }
    } catch (error) {
      stats.errors++;
      stats.results.push({
        aircraftId: fp.aircraftId,
        originalRoute: fp.route,
        newRoute: '',
        routeType: 'adar',
        routeId: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  return stats;
}

/**
 * Process a single flightplan
 */
export async function processSingleFlightplan(
  flightplan: ApiFlightplan,
  amendFlightplan: (dto: CreateOrAmendFlightplanDto) => Promise<void>,
  activeGroups: string[] = []
): Promise<ProcessingResult | null> {
  const amendmentResult = await findBestRouteForFlightplan(flightplan, activeGroups);
  
  if (!amendmentResult || !amendmentResult.needsAmendment) {
    return null;
  }
  
  const routeToAmend = flightplan.status === 'Active' ? amendmentResult.newRoute : amendmentResult.stripRoute;
  console.log(`[AutoRouting] ${flightplan.aircraftId}: amending via ${amendmentResult.routeType} "${amendmentResult.routeId}" -> "${routeToAmend}"`);

  try {
    const dto = buildAmendDto(flightplan, routeToAmend);
    await amendFlightplan(dto);
    console.log(`[AutoRouting] ${flightplan.aircraftId}: amendment SUCCESS`);

    return {
      aircraftId: flightplan.aircraftId,
      originalRoute: flightplan.route,
      newRoute: routeToAmend,
      routeType: amendmentResult.routeType!,
      routeId: amendmentResult.routeId!,
      success: true
    };
  } catch (error) {
    console.error(`[AutoRouting] ${flightplan.aircraftId}: amendment FAILED`, error);
    return {
      aircraftId: flightplan.aircraftId,
      originalRoute: flightplan.route,
      newRoute: routeToAmend,
      routeType: amendmentResult.routeType!,
      routeId: amendmentResult.routeId!,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
