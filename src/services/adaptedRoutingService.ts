/**
 * Adapted Routing Service
 * Ported from C# AuroraLabelItemsPlugin AdaptedRoutings.cs
 *
 * Implements FAA adapted departure/arrival route matching logic
 * for flight plan validation and preferred routing.
 */

import type {
  AdaptedDepartureArrival,
  AdaptedDeparture,
  AdaptedArrival,
  AdaptedDepartureXLine,
  AdaptedArrivalXLine,
  AdaptedRoutingData,
  ATCRoute,
  AircraftClass,
  FlightDataRecord,
  ParsedRouteSegment,
  IERRCapability,
  ApiAdaptedDepartureRoute,
  ApiAdaptedArrivalRoute,
  ApiAdaptedDepartureArrivalRoute,
  TransitionFix,
} from "../types/adaptedRouting/adaptedRoute";
import { loadAdaptedRoutingData } from "./adaptedRoutingXmlParser";

// RNAV capability constants
const RNV_D1 = "D1";
const RNV_E2 = "E2";
const RNV_A1 = "A1";
const RNV_E99 = "E99";
const GNSS_INS_PBN = "GIRX";
const GNSS = "G";
const PBN = "R";
const RNP1_O1 = "O1";
const RNP1_O2 = "O2";
const RNV1_D1 = "D1";
const RNV1_D2 = "D2";
const RNV1_D4 = "D4";
const RNV2_C1 = "C1";
const RNV2_C2 = "C2";
const RNV2_C4 = "C4";

// vNAS Aircraft Specs URL
const AIRCRAFT_SPECS_URL = "https://data-api.vnas.vatsim.net/Files/AircraftSpecs.json";

/**
 * Cached aircraft class data
 */
let cachedAircraftClasses: AircraftClass[] | null = null;

/**
 * Fetch aircraft specifications from vNAS API
 */
export async function getAircraftSpecs(): Promise<AircraftClass[]> {
  if (cachedAircraftClasses) {
    return cachedAircraftClasses;
  }

  try {
    const response = await fetch(AIRCRAFT_SPECS_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch aircraft specs: ${response.status}`);
    }
    cachedAircraftClasses = await response.json();
    return cachedAircraftClasses ?? [];
  } catch (error) {
    console.error("Error fetching aircraft specifications:", error);
    return [];
  }
}

/**
 * Get aircraft class string based on engine type and weight category
 */
export async function getAircraftClass(fdr: FlightDataRecord): Promise<string> {
  try {
    const aircraftClasses = await getAircraftSpecs();

    let jet = false;
    let turboProp = false;
    let prop = false;
    let heavy = false;

    for (const t of aircraftClasses) {
      if (t.designator === fdr.aircraftType) {
        jet = t.engineType === "Jet";
        turboProp = t.engineType === "Turboprop/Turboshaft";
        prop = t.engineType === "Piston";
        heavy = t.wtc === "H";
        break;
      }
    }

    if (jet && heavy) return "ZOAJ ZOAH";
    if (jet && !turboProp && !prop) return "ZOAJ";
    if (!jet && turboProp && !prop) return "ZOAN";
    if (!jet && !turboProp && prop) return "ZOAP";
    return "NATALL";
  } catch {
    return "NATALL";
  }
}

/**
 * Check if flight is eligible for adapted departure processing
 */
export function adaptedDepartureEligibility(fdr: FlightDataRecord): boolean {
  // Process proposed and active flights; skip only inactive/cancelled
  const status = fdr.status?.toLowerCase() ?? '';
  if (status === 'inactive' || status === 'cancelled') return false;

  // Must have departure and destination airports
  if (!fdr.departure || !fdr.destination) return false;

  // VFR flights not eligible
  if (fdr.altitude.toUpperCase().includes("VFR")) return false;

  return true;
}

/**
 * Parse RNAV capability from flight plan remarks
 */
export function getRnavCapability(fdr: FlightDataRecord): string | null {
  const navMatch = fdr.remarks?.match(/NAV\/RNV\w+/);
  const pbnMatch = fdr.remarks?.match(/PBN\/\w+\s/);

  const nav = navMatch?.[0] ?? "";
  const pbn = pbnMatch?.[0] ?? "";
  const equipment = fdr.equipment ?? "";

  // Check various RNAV capability combinations
  const bcD1 =
    (pbn.includes(RNP1_O1) ||
      pbn.includes(RNP1_O2) ||
      pbn.includes(RNV1_D1) ||
      pbn.includes(RNV1_D2) ||
      nav.includes(RNV_D1)) &&
    equipment.includes(GNSS_INS_PBN);

  const bcA1 =
    (pbn.includes(RNP1_O1) ||
      pbn.includes(RNP1_O2) ||
      pbn.includes(RNV1_D1) ||
      pbn.includes(RNV1_D2) ||
      nav.includes(RNV_A1)) &&
    equipment.includes(GNSS_INS_PBN);

  const gcD1 =
    nav.includes(RNV_D1) &&
    equipment.includes(GNSS) &&
    !equipment.includes(GNSS_INS_PBN) &&
    !equipment.includes(PBN);

  const gcA1 =
    nav.includes(RNV_A1) &&
    equipment.includes(GNSS) &&
    !equipment.includes(GNSS_INS_PBN) &&
    !equipment.includes(PBN);

  const vcD1 =
    (pbn.includes(RNV1_D4) || nav.includes(RNV_D1)) &&
    equipment.includes(PBN) &&
    !equipment.includes(GNSS) &&
    !equipment.includes(GNSS_INS_PBN);

  const vcA1 =
    (pbn.includes(RNV1_D4) || nav.includes(RNV_A1)) &&
    equipment.includes(PBN) &&
    !equipment.includes(GNSS) &&
    !equipment.includes(GNSS_INS_PBN);

  const vcE2 =
    (pbn.includes(RNV2_C1) ||
      pbn.includes(RNV2_C2) ||
      pbn.includes(RNV2_C4) ||
      nav.includes(RNV_E2)) &&
    equipment.includes(PBN) &&
    !equipment.includes(GNSS) &&
    !equipment.includes(GNSS_INS_PBN);

  const rnav =
    (pbn.length > 0 || nav.includes(RNV_E99) || !nav) &&
    (equipment.includes(GNSS_INS_PBN) || equipment.includes(GNSS) || equipment.includes(PBN));

  // Return capability string based on priority
  if (bcD1 && bcA1) return "ZOA BC D1A1 [1]ZOA  RNVA1RNVD1 AND [GIRX][][][]";
  if (bcD1 && !bcA1) return "ZOA BC D1 [2]ZOA  RNVD1 AND [GIRX][][][]";
  if (!bcD1 && bcA1) return "ZOA BC A1 [1]ZOA  RNVA1 AND [GIRX][][][]";
  if (gcD1 && gcA1) return "ZOA GC D1A1";
  if (gcD1 && !gcA1) return "ZOA GC D1 [1]ZOA  RNVD1 AND [G][][][]";
  if (!gcD1 && gcA1) return "ZOA GC A1 [1]ZOA  RNVA1 AND [G][][][]";
  if (vcD1 && vcA1) return "ZOA VC D1A1";
  if (vcD1 && !vcA1) return "ZOA VC D1 [1]ZOA  RNVD1 AND [R][][][]";
  if (!vcD1 && vcA1) return "ZOA VC A1 [1]ZOA  RNVA1 AND [R][][][]";
  if (vcE2) return "ZOA VC E2 [10]ZOA  RNVE2 AND [R][][][]";
  if (rnav) return "ZOA RNAV";

  return "ZOA NONE";
}

/**
 * Map RNAV capability string to enum value
 */
export function getCapabilityFromString(capability: string | null): number | null {
  if (!capability) return null;

  const capabilityMap: Record<string, number> = {
    "ZOA BC D1A1 [1]ZOA  RNVA1RNVD1 AND [GIRX][][][]": 11, // ZOA_BC_D1A1
    "ZOA BC D1 [1]ZOA  RNVD1 AND [GIRX][][][]": 10, // ZOA_BC_D1
    "ZOA BC D1 [2]ZOA  RNVD1 AND [GIRX][][][]": 10, // ZOA_BC_D1
    "ZOA BC D1[100]ZOA RNVD1 AND[GIRX][][][]": 10, // ZOA_BC_D1
    "ZOA BC A1 [1]ZOA  RNVA1 AND [GIRX][][][]": 9, // ZOA_BC_A1
    "ZOA BC A1 [3]ZOA  RNVA1 AND [GIRX][][][]": 9, // ZOA_BC_A1
    "ZOA BC A1 [10]ZOA  RNVA1 AND [GIRX][][][]": 9, // ZOA_BC_A1
    "ZOA GC D1A1": 8, // ZOA_GC_D1A1
    "ZOA GC D1 [1]ZOA  RNVD1 AND [G][][][]": 7, // ZOA_GC_D1
    "ZOA GC A1 [1]ZOA  RNVA1 AND [G][][][]": 6, // ZOA_GC_A1
    "ZOA VC D1A1": 5, // ZOA_VC_D1A1
    "ZOA VC D1 [1]ZOA  RNVD1 AND [R][][][]": 4, // ZOA_VC_D1
    "ZOA VC A1 [1]ZOA  RNVA1 AND [R][][][]": 3, // ZOA_VC_A1
    "ZOA VC E2 [10]ZOA  RNVE2 AND [R][][][]": 2, // ZOA_VC_E2
    "ZOA VC E2[10]ZOA RNVE2 AND[R][][][]": 2, // ZOA_VC_E2 (no-space CSV variant)
    "ZOA RNAV": 1, // ZOA_RNAV
    "ZOA NONE": 0, // ZOA_NONE
  };

  return capabilityMap[capability] ?? null;
}

/**
 * Parse altitude string to flight level number
 */
function parseAltitude(altitude: string): number {
  // Handle FL prefix
  if (altitude.toUpperCase().startsWith("FL")) {
    return parseInt(altitude.substring(2), 10) * 100;
  }
  // Handle A prefix (altitude below 18000)
  if (altitude.toUpperCase().startsWith("A")) {
    return parseInt(altitude.substring(1), 10) * 100;
  }
  // Just a number - could be FL or feet depending on value
  const num = parseInt(altitude, 10);
  if (num <= 600) {
    // Likely flight level
    return num * 100;
  }
  return num;
}

/**
 * Check if route passes distance checks for departure routes
 */
function passesDistanceChecksDeparture(
  fdr: FlightDataRecord,
  record: AdaptedDeparture
): boolean {
  const routeWaypoints = fdr.parsedRoute?.filter(
    (s) => s.type === "WAYPOINT"
  ) ?? [];

  const autoRouteLimit = record.autoRouteLimit ?? 0;

  if (autoRouteLimit >= 10) {
    // Distance-based check (AutoRouteLimit >= 10 treated as max NM to transition fix)
    let sumDist = 0;
    for (let wpIndex = 0; wpIndex < routeWaypoints.length; wpIndex++) {
      if (routeWaypoints[wpIndex].name === record.transitionFixes) {
        break;
      }
      sumDist += routeWaypoints[wpIndex].distance ?? 0;
    }
    return sumDist <= autoRouteLimit;
  } else if (autoRouteLimit <= 9 && autoRouteLimit > 0) {
    // Segment count check (1-9: max waypoints before the transition fix)
    let segmentCount = 0;
    for (const waypoint of routeWaypoints) {
      if (waypoint.name === record.transitionFixes) {
        break;
      }
      segmentCount++;
    }
    return segmentCount <= autoRouteLimit;
  }

  return true; // No limit
}

/**
 * Check if route passes distance checks for arrival routes
 */
function passesDistanceChecksArrival(
  fdr: FlightDataRecord,
  record: AdaptedArrival
): boolean {
  const routeWaypoints = fdr.parsedRoute?.filter(
    (s) => s.type === "WAYPOINT"
  ) ?? [];

  const autoRouteLimit = record.autoRouteLimit ?? 0;

  if (autoRouteLimit >= 10) {
    // Distance-based check (working backwards from destination)
    let sumDist = 0;
    for (let wpIndex = routeWaypoints.length - 1; wpIndex > 0; wpIndex--) {
      if (routeWaypoints[wpIndex].name === record.transitionFixes) {
        break;
      }
      sumDist += routeWaypoints[wpIndex].distance ?? 0;
    }
    return sumDist <= autoRouteLimit;
  } else if (autoRouteLimit <= 9 && autoRouteLimit > 0) {
    // Segment count check
    let segmentCount = 0;
    for (let wpIndex = routeWaypoints.length - 1; wpIndex > 0; wpIndex--) {
      if (routeWaypoints[wpIndex].name === record.transitionFixes) {
        break;
      }
      segmentCount++;
    }
    return segmentCount <= autoRouteLimit;
  }

  return true;
}

/**
 * Check if an airport field (space/comma-delimited tokens) contains the given airport exactly.
 * Matches the C# AirportMatches() token-comparison logic.
 */
function airportMatches(field: string | undefined, airport: string): boolean {
  if (!field || !airport) return false;
  return field.split(/[\s,]+/).some((a) => a === airport);
}

/**
 * Check if flight is geographically appropriate for departure route
 */
function isGeographicallyAppropriateDeparture(
  fdr: FlightDataRecord,
  record: AdaptedDeparture,
  xLines: AdaptedDepartureXLine[]
): boolean {
  const routeFixNames = fdr.parsedRoute?.map((s) => s.name) ?? [];

  // Per spec 4.3.6.4.3: ADR is applicable if route passes through a transition fix
  // OR the route crosses a D-line (crossing line).
  // Transition fix check takes precedence and is sufficient on its own.
  const hasTfixes = !!record.transitionFixes;
  if (hasTfixes) {
    const list: TransitionFix[] = record.transitionFixList?.length
      ? record.transitionFixList
      : record.transitionFixes.split(/\s+/).filter(Boolean).map(name => ({ name, type: 'Append' as const }));
    const routeUpper = routeFixNames.map(n => n.toUpperCase());
    const tfixInRoute = list.some(tfix =>
      tfix.type === 'Implicit'
        ? (tfix.tfixRoute ? routeUpper.includes(tfix.tfixRoute.toUpperCase()) : false)
        : routeUpper.includes(tfix.name.toUpperCase())
    );
    if (tfixInRoute) {
      return true; // Route contains a transition fix — geographically applicable
    }
    // Transition fixes exist but none are in the route.
    // Per spec, still check crossing lines if we have XLine data.
    if (xLines.length > 0 && record.xLines) {
      const recordXLines = xLines.filter((x) => x.adrId === record.routeId);
      for (const xline of recordXLines) {
        if (routeFixNames.includes(xline.tFix)) {
          const rfl = parseAltitude(fdr.altitude);
          if (
            rfl >= (xline.xLineLowerAltitude ?? 0) &&
            rfl <= (xline.xLineUpperAltitude ?? 99999) &&
            xline.xLineAirports?.includes(fdr.departure)
          ) {
            return true;
          }
        }
      }
    }
    // Tfixes exist, none matched, no XLine data to fall back on — not applicable.
    return false;
  }

  // Record has no transition fixes — applied purely via crossing line (D-line).
  if (xLines.length > 0 && record.xLines) {
    const recordXLines = xLines.filter((x) => x.adrId === record.routeId);
    for (const xline of recordXLines) {
      if (routeFixNames.includes(xline.tFix)) {
        const rfl = parseAltitude(fdr.altitude);
        if (
          rfl >= (xline.xLineLowerAltitude ?? 0) &&
          rfl <= (xline.xLineUpperAltitude ?? 99999) &&
          xline.xLineAirports?.includes(fdr.departure)
        ) {
          return true;
        }
      }
    }
    return false; // XLine data present but nothing matched
  }

  // No transition fixes and no XLine data — cannot determine geographically.
  // Pass through and let airport/altitude/class filters decide.
  return true;
}

/**
 * Check if flight is geographically appropriate for arrival route
 */
function isGeographicallyAppropriateArrival(
  fdr: FlightDataRecord,
  record: AdaptedArrival,
  xLines: AdaptedArrivalXLine[]
): boolean {
  const routeFixNames = fdr.parsedRoute?.map((s) => s.name) ?? [];

  const hasTfixes = !!record.transitionFixes;
  if (hasTfixes) {
    const list: TransitionFix[] = record.transitionFixList?.length
      ? record.transitionFixList
      : record.transitionFixes.split(/\s+/).filter(Boolean).map(name => ({ name, type: 'Append' as const }));
    const routeUpper = routeFixNames.map(n => n.toUpperCase());
    const tfixInRoute = list.some(tfix =>
      tfix.type === 'Implicit'
        ? (tfix.tfixRoute ? routeUpper.includes(tfix.tfixRoute.toUpperCase()) : false)
        : routeUpper.includes(tfix.name.toUpperCase())
    );
    if (tfixInRoute) {
      return true; // Route contains a transition fix — geographically applicable
    }
    // Transition fixes exist but none are in the route.
    if (xLines.length > 0 && record.xLines) {
      const recordXLines = xLines.filter((x) => x.aarId === record.routeId);
      for (const xline of recordXLines) {
        if (routeFixNames.includes(xline.tFix)) {
          const rfl = parseAltitude(fdr.altitude);
          if (
            rfl >= (xline.xLineLowerAltitude ?? 0) &&
            rfl <= (xline.xLineUpperAltitude ?? 99999) &&
            xline.xLineAirports?.includes(fdr.destination)
          ) {
            return true;
          }
        }
      }
    }
    // Tfixes exist, none matched, no XLine data to fall back on — not applicable.
    return false;
  }

  // Record has no transition fixes — applied purely via crossing line (D-line).
  if (xLines.length > 0 && record.xLines) {
    const recordXLines = xLines.filter((x) => x.aarId === record.routeId);
    for (const xline of recordXLines) {
      if (routeFixNames.includes(xline.tFix)) {
        const rfl = parseAltitude(fdr.altitude);
        if (
          rfl >= (xline.xLineLowerAltitude ?? 0) &&
          rfl <= (xline.xLineUpperAltitude ?? 99999) &&
          xline.xLineAirports?.includes(fdr.destination)
        ) {
          return true;
        }
      }
    }
    return false; // XLine data present but nothing matched
  }

  // No transition fixes and no XLine data — cannot determine geographically.
  // Pass through and let airport/altitude/class filters decide.
  return true;
}

/**
 * Adapted Routings Service Class
 */
export class AdaptedRoutingsService {
  private data: AdaptedRoutingData;
  private initialized: boolean = false;

  constructor() {
    this.data = {
      adaptedDepartureArrivals: [],
      adaptedDepartures: [],
      adaptedArrivals: [],
      adaptedDepartureXLines: [],
      adaptedArrivalXLines: [],
    };
  }

  /**
   * Initialize the service by loading data from XML files
   */
  async initialize(basePath?: string, artccId?: string): Promise<void> {
    this.data = await loadAdaptedRoutingData(basePath, artccId);
    await getAircraftSpecs(); // Pre-load aircraft specs
    this.initialized = true;
  }

  /**
   * Set data directly (useful for testing or loading from other sources)
   */
  setData(data: AdaptedRoutingData): void {
    this.data = data;
    this.initialized = true;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Find applicable ADAR routes for a flight
   */
  async findApplicableAdar(
    fdr: FlightDataRecord,
    activeGroups: string[]
  ): Promise<AdaptedDepartureArrival[]> {
    const aircraftClass = await getAircraftClass(fdr);
    const rnavCapabilityString = getRnavCapability(fdr) ?? "";
    const rnavCapability = getCapabilityFromString(rnavCapabilityString);
    const rfl = parseAltitude(fdr.altitude);
    console.log(`[AutoRouting] ${fdr.callsign}: ADAR check | rfl=${rfl} ac=${aircraftClass} rnav="${rnavCapabilityString}"(${rnavCapability}) records=${this.data.adaptedDepartureArrivals.length} activeGroups=[${activeGroups.join(',')}]`);

    return this.data.adaptedDepartureArrivals.filter((record) => {
      const reject = (reason: string) => {
        console.log(`[AutoRouting] ${fdr.callsign}: ADAR "${record.routeId}" SKIP: ${reason}`);
        return false;
      };

      if (!adaptedDepartureEligibility(fdr)) return reject(`eligibility (status=${fdr.status} dep=${fdr.departure} dest=${fdr.destination})`);
      if (activeGroups.length > 0 && !record.routeGroups.some(g => activeGroups.includes(g))) return reject(`routeGroup record=[${record.routeGroups}] not in activeGroups=[${activeGroups}]`);
      if (rfl < (record.lowerAltitude ?? 0)) return reject(`alt too low: ${rfl} < ${record.lowerAltitude}`);
      if (rfl > (record.upperAltitude ?? 99999)) return reject(`alt too high: ${rfl} > ${record.upperAltitude}`);
      if (!airportMatches(record.depAirports, fdr.departure)) return reject(`depAirport: "${fdr.departure}" not in "${record.depAirports}"`);
      if (!airportMatches(record.arrAirports, fdr.destination)) return reject(`arrAirport: "${fdr.destination}" not in "${record.arrAirports}"`);

      if (record.acClassCriteria) {
        const recordClasses = record.acClassCriteria.split(/\s+/);
        const fdrClasses = aircraftClass.split(/\s+/);
        const classMatch = fdrClasses.includes('NATALL') || recordClasses.some((ac) => ac === 'NATALL' || fdrClasses.includes(ac));
        if (!classMatch)
          return reject(`acClass: fdr=[${fdrClasses}] not in record=[${recordClasses}]`);
      }

      if (record.departureContentCriteria && !fdr.route.includes(record.departureContentCriteria))
        return reject(`depContent: "${record.departureContentCriteria}" not in route`);
      if (record.destinationContentCriteria && !fdr.route.includes(record.destinationContentCriteria))
        return reject(`destContent: "${record.destinationContentCriteria}" not in route`);

      if (record.ierrCriteria) {
        const recordCapability = getCapabilityFromString(record.ierrCriteria);
        if (recordCapability !== null && rnavCapability !== null && rnavCapability < recordCapability)
          return reject(`ierr: fdr=${rnavCapability}("${rnavCapabilityString}") < record=${recordCapability}("${record.ierrCriteria}")`);
      }

      console.log(`[AutoRouting] ${fdr.callsign}: ADAR "${record.routeId}" MATCH`);
      return true;
    });
  }

  /**
   * Find applicable ADR routes for a flight
   */

  async findApplicableAdr(
    fdr: FlightDataRecord,
    activeGroups: string[]
  ): Promise<AdaptedDeparture[]> {
    const aircraftClass = await getAircraftClass(fdr);
    const rnavCapabilityString = getRnavCapability(fdr) ?? "";
    const rnavCapability = getCapabilityFromString(rnavCapabilityString);
    const rfl = parseAltitude(fdr.altitude);
    console.log(`[AutoRouting] ${fdr.callsign}: ADR check | rfl=${rfl} ac=${aircraftClass} rnav="${rnavCapabilityString}"(${rnavCapability}) records=${this.data.adaptedDepartures.length} activeGroups=[${activeGroups.join(',')}]`);

    return this.data.adaptedDepartures.filter((record) => {
      const reject = (reason: string) => {
        console.log(`[AutoRouting] ${fdr.callsign}: ADR "${record.routeId}" SKIP: ${reason}`);
        return false;
      };

      if (!isGeographicallyAppropriateDeparture(fdr, record, this.data.adaptedDepartureXLines))
        return reject(`geographic (tFixes="${record.transitionFixes}" route=[${fdr.parsedRoute?.map(s=>s.name).join(',')}])`);
      if (!adaptedDepartureEligibility(fdr)) return reject(`eligibility (status=${fdr.status} dep=${fdr.departure} dest=${fdr.destination})`);
      if (activeGroups.length > 0 && !record.routeGroups.some(g => activeGroups.includes(g))) return reject(`routeGroup record=[${record.routeGroups}] not in activeGroups=[${activeGroups}]`);
      if (rfl < (record.lowerAltitude ?? 0)) return reject(`alt too low: ${rfl} < ${record.lowerAltitude}`);
      if (rfl > (record.upperAltitude ?? 99999)) return reject(`alt too high: ${rfl} > ${record.upperAltitude}`);
      if (!airportMatches(record.airports, fdr.departure)) return reject(`airport: "${fdr.departure}" not in "${record.airports}"`);

      if (record.acClassCriteria) {
        const recordClasses = record.acClassCriteria.split(/\s+/);
        const fdrClasses = aircraftClass.split(/\s+/);
        const classMatch = fdrClasses.includes('NATALL') || recordClasses.some((ac) => ac === 'NATALL' || fdrClasses.includes(ac));
        if (!classMatch)
          return reject(`acClass: fdr=[${fdrClasses}] not in record=[${recordClasses}]`);
      }

      if (!passesDistanceChecksDeparture(fdr, record)) return reject(`distance check failed (autoRouteLimit=${record.autoRouteLimit})`);

      if (record.departureContentCriteria && !fdr.route.includes(record.departureContentCriteria))
        return reject(`depContent: "${record.departureContentCriteria}" not in route`);

      if (record.ierrCriteria) {
        const recordCapability = getCapabilityFromString(record.ierrCriteria);
        if (recordCapability !== null && rnavCapability !== null && rnavCapability < recordCapability)
          return reject(`ierr: fdr=${rnavCapability}("${rnavCapabilityString}") < record=${recordCapability}("${record.ierrCriteria}")`);
      }

      console.log(`[AutoRouting] ${fdr.callsign}: ADR "${record.routeId}" MATCH`);
      return true;
    });
  }

  /**
   * Find applicable AAR routes for a flight
   */
  async findApplicableAar(
    fdr: FlightDataRecord,
    activeGroups: string[]
  ): Promise<AdaptedArrival[]> {
    const aircraftClass = await getAircraftClass(fdr);
    const rnavCapabilityString = getRnavCapability(fdr) ?? "";
    const rnavCapability = getCapabilityFromString(rnavCapabilityString);
    const rfl = parseAltitude(fdr.altitude);

    return this.data.adaptedArrivals.filter((record) => {
      // Geographic check
      if (!isGeographicallyAppropriateArrival(fdr, record, this.data.adaptedArrivalXLines)) {
        return false;
      }

      // Route group match
      if (activeGroups.length > 0 && !record.routeGroups.some(g => activeGroups.includes(g))) return false;

      // Altitude check
      if (rfl < (record.lowerAltitude ?? 0)) return false;
      if (rfl > (record.upperAltitude ?? 99999)) return false;

      // Airport check (token match)
      if (!airportMatches(record.airports, fdr.destination)) return false;

      // Distance/segment check
      if (!passesDistanceChecksArrival(fdr, record)) return false;

      if (record.acClassCriteria) {
        const recordClasses = record.acClassCriteria.split(/\s+/);
        const fdrClasses = aircraftClass.split(/\s+/);
        const classMatch = fdrClasses.includes('NATALL') || recordClasses.some((ac) => ac === 'NATALL' || fdrClasses.includes(ac));
        if (!classMatch) return false;
      }

      // Destination content criteria check
      if (record.destinationContentCriteria) {
        if (!fdr.route.includes(record.destinationContentCriteria)) return false;
      }

      // IERR capability check
      if (record.ierrCriteria) {
        const recordCapability = getCapabilityFromString(record.ierrCriteria);
        if (
          recordCapability !== null &&
          rnavCapability !== null &&
          rnavCapability < recordCapability
        ) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Render and select the best route combination
   */
  async renderAndConcatenateRoute(
    adar: AdaptedDepartureArrival[],
    adr: AdaptedDeparture[],
    aar: AdaptedArrival[]
  ): Promise<ATCRoute> {
    let selectedDepartureArrival: AdaptedDepartureArrival | null = null;
    let selectedDeparture: AdaptedDeparture | null = null;
    let selectedArrival: AdaptedArrival | null = null;

    // Routes with null IERR criteria get -1 (sorted last), matching C# behaviour.
    const ierrPriority = (criteria: string): number =>
      getCapabilityFromString(criteria) ?? -1;

    // Sort and select ADAR (highest priority)
    if (adar.length > 0) {
      selectedDepartureArrival = adar
        .sort((a, b) => {
          const diff = ierrPriority(b.ierrCriteria) - ierrPriority(a.ierrCriteria);
          if (diff !== 0) return diff; // Higher capability first
          if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
          return a.routeId.localeCompare(b.routeId);
        })[0];
    }

    // If no ADAR, try ADR
    if (!selectedDepartureArrival && adr.length > 0) {
      selectedDeparture = adr
        .sort((a, b) => {
          const diff = ierrPriority(b.ierrCriteria) - ierrPriority(a.ierrCriteria);
          if (diff !== 0) return diff;
          if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
          return a.routeId.localeCompare(b.routeId);
        })[0];
    }

    // If no ADAR or ADR, try AAR
    if (!selectedDepartureArrival && !selectedDeparture && aar.length > 0) {
      selectedArrival = aar
        .sort((a, b) => {
          const diff = ierrPriority(b.ierrCriteria) - ierrPriority(a.ierrCriteria);
          if (diff !== 0) return diff;
          if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
          return a.routeId.localeCompare(b.routeId);
        })[0];
    }

    return {
      selectedDepartureArrival,
      selectedDeparture,
      selectedArrival,
    };
  }

  /**
   * Convert internal routes to API-compatible format (matching EDST)
   */
  convertToApiFormat(
    fdr: FlightDataRecord,
    adar: AdaptedDepartureArrival[],
    adr: AdaptedDeparture[],
    aar: AdaptedArrival[]
  ): {
    apiAdar: ApiAdaptedDepartureArrivalRoute[];
    apiAdr: ApiAdaptedDepartureRoute[];
    apiAar: ApiAdaptedArrivalRoute[];
  } {
    const rnavCapability = getRnavCapability(fdr);

    const apiAdar: ApiAdaptedDepartureArrivalRoute[] = adar.map((r) => ({
      route: r.autoRouteAlphas,
      departure: fdr.departure,
      destination: fdr.destination,
      eligible: true, // Already filtered to eligible routes
      rnavRequired: !!r.ierrCriteria,
      order: r.order ?? 999,
      routeGroups: r.routeGroups,
    }));

    const apiAdr: ApiAdaptedDepartureRoute[] = adr.map((r) => ({
      departure: fdr.departure,
      amendment: r.autoRouteAlphas,
      triggeredFix: r.transitionFixes?.split(/\s+/)[0] ?? "",
      eligible: true,
      rnavRequired: !!r.ierrCriteria,
      truncatedRoute: r.autoRouteAlphas,
      order: r.order ?? 999,
      routeGroups: r.routeGroups,
    }));

    const apiAar: ApiAdaptedArrivalRoute[] = aar.map((r) => ({
      destination: fdr.destination,
      amendment: r.autoRouteAlphas,
      triggeredFix: r.transitionFixes?.split(/\s+/)[0] ?? "",
      eligible: true,
      rnavRequired: !!r.ierrCriteria,
      truncatedRoute: r.autoRouteAlphas,
      order: r.order ?? 999,
      routeGroups: r.routeGroups,
    }));

    return { apiAdar, apiAdr, apiAar };
  }

  /**
   * Get all applicable routes for a flight and convert to API format
   */
  async getRoutesForFlight(
    fdr: FlightDataRecord,
    activeGroups: string[] = []
  ): Promise<{
    adar: ApiAdaptedDepartureArrivalRoute[];
    adr: ApiAdaptedDepartureRoute[];
    aar: ApiAdaptedArrivalRoute[];
    selectedRoute: ATCRoute;
  }> {
    const [adarRaw, adrRaw, aarRaw] = await Promise.all([
      this.findApplicableAdar(fdr, activeGroups),
      this.findApplicableAdr(fdr, activeGroups),
      this.findApplicableAar(fdr, activeGroups),
    ]);

    const { apiAdar, apiAdr, apiAar } = this.convertToApiFormat(
      fdr,
      adarRaw,
      adrRaw,
      aarRaw
    );

    const selectedRoute = await this.renderAndConcatenateRoute(
      adarRaw,
      adrRaw,
      aarRaw
    );

    return {
      adar: apiAdar,
      adr: apiAdr,
      aar: apiAar,
      selectedRoute,
    };
  }
}

/**
 * Strip adapted route blocks (the +...+ markers) from a route string.
 * Used by the RM command before re-matching.
 */
export function stripAdaptedRoute(route: string): string {
  return route.replace(/\+[^+]+\+\s*/g, '').trim();
}

/**
 * Clean route string - normalize formatting
 * Replaces ".." with space, removes brackets if present
 */
// ---------------------------------------------------------------------------
// Route-merge helpers — implementing §4.3.6.6, §4.3.6.8, §4.3.6.9
// ---------------------------------------------------------------------------

/**
 * Tokenize adapted route alphanumeric string (dot and space separators).
 * ".MER4.SGD..PYE..STINS.." → ["MER4", "SGD", "PYE", "STINS"]
 */
function tokenizeAlphanumerics(alphas: string): string[] {
  return alphas.split(/[.\s]+/).filter(Boolean).map(s => s.toUpperCase());
}

/**
 * Tokenize a filed route string (space-separated, may contain slashes).
 */
function tokenizeRoute(route: string): string[] {
  return route.split(/[\s./]+/).filter(Boolean).map(s => s.toUpperCase());
}

/**
 * Return the TransitionFix from the record whose name (or, for Implicit tfixes,
 * whose containing airway) appears in the route.  The first match wins.
 *
 * For Explicit / Append / Prepend: match by fix name directly in the route tokens.
 * For Implicit: match by tfixRoute (the airway element that contains the fix).
 * This means we never need navdata — the XML already encodes the airway.
 */
function findMatchingTransitionFix(
  routeTokens: string[],
  record: AdaptedDeparture | AdaptedArrival
): TransitionFix | null {
  const list: TransitionFix[] = record.transitionFixList?.length
    ? record.transitionFixList
    : record.transitionFixes.split(/\s+/).filter(Boolean).map(name => ({ name, type: 'Append' as const }));

  for (const tfix of list) {
    if (tfix.type === 'Implicit') {
      // Implicit: the fix is inside an airway — match the airway name in the route.
      const airway = tfix.tfixRoute?.toUpperCase();
      if (airway && routeTokens.includes(airway)) return tfix;
    } else {
      if (routeTokens.includes(tfix.name.toUpperCase())) return tfix;
    }
  }
  return null;
}

/**
 * Return the route token used as the merge/split boundary for a given tfix.
 * For Implicit tfixes this is the airway (tfixRoute), not the fix name —
 * the fix itself never appears as a discrete token in the filed route.
 */
function mergeToken(tfix: TransitionFix): string {
  return (tfix.type === 'Implicit' && tfix.tfixRoute)
    ? tfix.tfixRoute.toUpperCase()
    : tfix.name.toUpperCase();
}

/**
 * §4.3.6.6 — Trim ADR adapted alphanumeric tokens based on the tfix location type.
 *
 * Explicit: trim up to but EXCLUDING the tfix (tfix is in the alphanumerics).
 * Implicit: trim up to and INCLUDING the route element (airway) containing the tfix.
 * Append  : tfix is not in the alphanumerics — use entire token list as-is.
 */
function trimAdrAlphas(adrTokens: string[], tfix: TransitionFix): string[] {
  const tfixUpper = tfix.name.toUpperCase();
  if (tfix.type === 'Explicit') {
    const idx = adrTokens.indexOf(tfixUpper);
    return idx !== -1 ? adrTokens.slice(0, idx) : adrTokens;
  }
  if (tfix.type === 'Implicit' && tfix.tfixRoute) {
    const idx = adrTokens.indexOf(tfix.tfixRoute.toUpperCase());
    return idx !== -1 ? adrTokens.slice(0, idx + 1) : adrTokens;
  }
  // Append (or unknown): tfix not in alphanumerics — use entire list.
  return adrTokens;
}

/**
 * §4.3.6.6 — Trim AAR adapted alphanumeric tokens based on the tfix location type.
 *
 * Explicit: trim starting AFTER the tfix (tfix is in the alphanumerics).
 * Implicit: trim starting FROM (and including) the route element containing the tfix.
 * Prepend : tfix is not in the alphanumerics — use entire token list as-is.
 */
function trimAarAlphas(aarTokens: string[], tfix: TransitionFix): string[] {
  const tfixUpper = tfix.name.toUpperCase();
  if (tfix.type === 'Explicit') {
    const idx = aarTokens.indexOf(tfixUpper);
    return idx !== -1 ? aarTokens.slice(idx + 1) : aarTokens;
  }
  if (tfix.type === 'Implicit' && tfix.tfixRoute) {
    const idx = aarTokens.indexOf(tfix.tfixRoute.toUpperCase());
    return idx !== -1 ? aarTokens.slice(idx) : aarTokens;
  }
  // Prepend (or unknown): tfix not in alphanumerics — use entire list.
  return aarTokens;
}

/**
 * Build proposal route for Proposed/Tentative flightplans.
 * Always outputs: +[adapted alphas]+ [full original filed route]
 * No merging — the original route is preserved in full after the +...+ block.
 */
export function buildProposalRoute(
  currentRoute: string,
  selectedRoute: ATCRoute
): string {
  if (!currentRoute) return currentRoute;

  let alphas: string;
  if (selectedRoute.selectedDepartureArrival) {
    alphas = tokenizeAlphanumerics(selectedRoute.selectedDepartureArrival.autoRouteAlphas).join(' ');
  } else if (selectedRoute.selectedDeparture) {
    alphas = tokenizeAlphanumerics(selectedRoute.selectedDeparture.autoRouteAlphas).join(' ');
  } else if (selectedRoute.selectedArrival) {
    alphas = tokenizeAlphanumerics(selectedRoute.selectedArrival.autoRouteAlphas).join(' ');
  } else {
    return currentRoute;
  }

  const originalTokens = tokenizeRoute(currentRoute);
  return `+${alphas}+ ${originalTokens.join(' ')}`;
}

/**
 * Build concatenated route from selected adapted route and current route.
 * Implements §4.3.6.9: rebuilds the full route rather than prepending/appending.
 * Used for Active flightplans only.
 *
 * ADR: [trimmed ADR alphas] [tfix] [filed route after tfix]
 * AAR: [filed route before tfix] [tfix] [trimmed AAR alphas]
 * ADAR: replaced entirely by the ADAR alphanumerics.
 */
export function buildConcatenatedRoute(
  currentRoute: string,
  selectedRoute: ATCRoute
): string {
  if (!currentRoute) return currentRoute;

  if (selectedRoute.selectedDepartureArrival) {
    // ADAR replaces the entire enroute portion.
    const adapted = tokenizeAlphanumerics(selectedRoute.selectedDepartureArrival.autoRouteAlphas).join(' ');
    return `+${adapted}+`;
  }

  if (selectedRoute.selectedDeparture) {
    const record = selectedRoute.selectedDeparture;
    const routeTokens = tokenizeRoute(currentRoute);
    const tfix = findMatchingTransitionFix(routeTokens, record);

    if (!tfix) {
      // No tfix found in route (edge case) — fall back to a simple prepend.
      const adrTokens = tokenizeAlphanumerics(record.autoRouteAlphas);
      return `+${adrTokens.join(' ')}+ ${routeTokens.join(' ')}`;
    }

    const adrTokens = tokenizeAlphanumerics(record.autoRouteAlphas);
    const trimmed = trimAdrAlphas(adrTokens, tfix);
    const mt = mergeToken(tfix);
    const mtIdx = routeTokens.indexOf(mt);
    // §4.3.6.9: remaining = filed route elements AFTER the merge token
    const remaining = mtIdx !== -1 ? routeTokens.slice(mtIdx + 1) : routeTokens;

    // +<trimmed adapted alphas>+ <tfix/airway> <rest of filed route>
    const parts: string[] = [];
    if (trimmed.length > 0) parts.push(`+${trimmed.join(' ')}+`);
    parts.push(mt);
    if (remaining.length > 0) parts.push(remaining.join(' '));
    return parts.join(' ');
  }

  if (selectedRoute.selectedArrival) {
    const record = selectedRoute.selectedArrival;
    const routeTokens = tokenizeRoute(currentRoute);
    const tfix = findMatchingTransitionFix(routeTokens, record);

    if (!tfix) {
      // No tfix found — fall back to a simple append.
      const aarTokens = tokenizeAlphanumerics(record.autoRouteAlphas);
      return `${routeTokens.join(' ')} +${aarTokens.join(' ')}+`;
    }

    const aarTokens = tokenizeAlphanumerics(record.autoRouteAlphas);
    const trimmed = trimAarAlphas(aarTokens, tfix);
    const mt = mergeToken(tfix);
    const mtIdx = routeTokens.indexOf(mt);
    // §4.3.6.9: prior = filed route elements BEFORE the merge token
    const prior = mtIdx !== -1 ? routeTokens.slice(0, mtIdx) : routeTokens;

    // <prior filed route> <tfix/airway> +<trimmed adapted alphas>+
    const parts: string[] = [];
    if (prior.length > 0) parts.push(prior.join(' '));
    parts.push(mt);
    if (trimmed.length > 0) parts.push(`+${trimmed.join(' ')}+`);
    return parts.join(' ');
  }

  return currentRoute;
}

/**
 * §4.3.6.8 — Check if the adapted route alphanumerics already exist in the filed route.
 *
 * ADR: trimmed ADR tokens must exactly equal the route segment from the start
 *      up to (but not including) the transition fix.
 * AAR: trimmed AAR tokens must exactly equal the route segment from after the
 *      transition fix to the end.
 * ADAR: all ADAR tokens must appear in order within the route.
 */
export function routeAlreadyContainsAdaptedRoute(
  currentRoute: string,
  selectedRoute: ATCRoute
): boolean {
  const strippedRoute = stripAdaptedRoute(currentRoute);
  const routeTokens = tokenizeRoute(strippedRoute);

  if (selectedRoute.selectedDepartureArrival) {
    // ADAR: all tokens must appear in order (subsequence) within the route.
    const adarTokens = tokenizeAlphanumerics(selectedRoute.selectedDepartureArrival.autoRouteAlphas);
    if (adarTokens.length === 0) return true;
    let idx = 0;
    for (const token of adarTokens) {
      idx = routeTokens.indexOf(token, idx);
      if (idx === -1) return false;
      idx++;
    }
    return true;
  }

  if (selectedRoute.selectedDeparture) {
    const record = selectedRoute.selectedDeparture;
    const tfix = findMatchingTransitionFix(routeTokens, record);
    if (!tfix) return false;

    const adrTokens = tokenizeAlphanumerics(record.autoRouteAlphas);
    const trimmed = trimAdrAlphas(adrTokens, tfix);
    const tfixIdx = routeTokens.indexOf(tfix.name.toUpperCase());
    const routeBeforeTfix = tfixIdx !== -1 ? routeTokens.slice(0, tfixIdx) : [];

    // Trimmed ADR must exactly match the route segment before the tfix.
    return (
      trimmed.length === routeBeforeTfix.length &&
      trimmed.every((t, i) => t === routeBeforeTfix[i])
    );
  }

  if (selectedRoute.selectedArrival) {
    const record = selectedRoute.selectedArrival;
    const tfix = findMatchingTransitionFix(routeTokens, record);
    if (!tfix) return false;

    const aarTokens = tokenizeAlphanumerics(record.autoRouteAlphas);
    const trimmed = trimAarAlphas(aarTokens, tfix);
    const tfixIdx = routeTokens.indexOf(tfix.name.toUpperCase());
    const routeAfterTfix = tfixIdx !== -1 ? routeTokens.slice(tfixIdx + 1) : [];

    // Trimmed AAR must exactly match the route segment after the tfix.
    return (
      trimmed.length === routeAfterTfix.length &&
      trimmed.every((t, i) => t === routeAfterTfix[i])
    );
  }

  return false;
}

/**
 * Result of route amendment operation
 */
export interface RouteAmendmentResult {
  /** Clean route without +...+ markers — sent to vNAS as the flightplan amendment. */
  newRoute: string;
  /** Route with +...+ markers around adapted blocks — displayed on the flight strip. */
  stripRoute: string;
  needsAmendment: boolean;
  routeType: "adar" | "adr" | "aar" | null;
  routeId: string | null;
}

/**
 * Compute the amended route for a flightplan
 * Returns the new route string and whether amendment is needed
 */
export function computeAmendedRoute(
  currentRoute: string,
  selectedRoute: ATCRoute
): RouteAmendmentResult {
  // Check if route already contains the adapted route
  if (routeAlreadyContainsAdaptedRoute(currentRoute, selectedRoute)) {
    return {
      newRoute: currentRoute,
      stripRoute: currentRoute,
      needsAmendment: false,
      routeType: null,
      routeId: null,
    };
  }

  // Build routes:
  // stripRoute — for Proposed/Tentative: +adapted alphas+ [full original route], no merging
  // newRoute   — for Active: clean merged route (no +...+ markers)
  const stripRoute = buildProposalRoute(currentRoute, selectedRoute);
  const newRoute = stripAdaptedRoute(buildConcatenatedRoute(currentRoute, selectedRoute));

  // Determine route type and ID
  let routeType: "adar" | "adr" | "aar" | null = null;
  let routeId: string | null = null;

  if (selectedRoute.selectedDepartureArrival) {
    routeType = "adar";
    routeId = selectedRoute.selectedDepartureArrival.routeId;
  } else if (selectedRoute.selectedDeparture) {
    routeType = "adr";
    routeId = selectedRoute.selectedDeparture.routeId;
  } else if (selectedRoute.selectedArrival) {
    routeType = "aar";
    routeId = selectedRoute.selectedArrival.routeId;
  }

  return {
    newRoute,
    stripRoute,
    needsAmendment: stripRoute !== currentRoute,
    routeType,
    routeId,
  };
}

// Export singleton instance
export const adaptedRoutingsService = new AdaptedRoutingsService();
