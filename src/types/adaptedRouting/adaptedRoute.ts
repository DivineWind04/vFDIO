/**
 * Adapted Routing Types
 * Ported from C# AuroraLabelItemsPlugin AdaptedRoutings.cs
 * Matches EDST API types for compatibility
 */

// TFix location type within the adapted alphanumerics (from XML TFixType element)
export type TFixLocationType = 'Append' | 'Prepend' | 'Explicit' | 'Implicit';

/**
 * A single transition fix with its location type.
 * Append  (ADR only): tfix follows the adapted alphanumerics (not in them)
 * Prepend (AAR only): tfix precedes the adapted alphanumerics (not in them)
 * Explicit: tfix is a named element directly in the adapted alphanumerics
 * Implicit: tfix is an internal fix on a route element (airway) in the adapted alphanumerics
 */
export interface TransitionFix {
  name: string;
  type: TFixLocationType;
  /** For Implicit: the airway/route element in the adapted alphanumerics that contains this fix */
  tfixRoute?: string;
}

// Base shared properties between all adapted route types
export interface AdaptedRouteBase {
  routeId: string;
  textCommands: string;
  routeGroups: string[];
  order: number | null;
  autoRouteLimit: number | null;
  lowerAltitude: number | null;
  upperAltitude: number | null;
  autoRouteAlphas: string;
  acClassCriteria: string;
  ierrCriteria: string;
  routeFixes: string;
}

// Adapted Departure Arrival Route (ADAR)
export interface AdaptedDepartureArrival extends AdaptedRouteBase {
  depAirports: string;
  arrAirports: string;
  departureContentCriteria: string;
  destinationContentCriteria: string;
}

// Adapted Departure Route (ADR)
export interface AdaptedDeparture extends AdaptedRouteBase {
  transitionFixes: string;
  transitionFixList: TransitionFix[];
  airports: string;
  xLines: string;
  departureContentCriteria: string;
}

// Adapted Arrival Route (AAR)
export interface AdaptedArrival extends AdaptedRouteBase {
  transitionFixes: string;
  transitionFixList: TransitionFix[];
  airports: string;
  xLines: string;
  destinationContentCriteria: string;
}

// XLine definitions for geographic checks
export interface AdaptedDepartureXLine {
  adrId: string;
  xLineId: string;
  xLineLowerAltitude: number | null;
  xLineUpperAltitude: number | null;
  xLineDistance: string;
  tFix: string;
  xLineAirports: string;
  xLineAcClassCriteria: string;
  coordinates: string;
}

export interface AdaptedArrivalXLine {
  aarId: string;
  xLineId: string;
  xLineLowerAltitude: number | null;
  xLineUpperAltitude: number | null;
  xLineDistance: string;
  tFix: string;
  xLineAirports: string;
  xLineAcClassCriteria: string;
  coordinates: string;
}

// Selected route result
export interface ATCRoute {
  selectedDepartureArrival: AdaptedDepartureArrival | null;
  selectedDeparture: AdaptedDeparture | null;
  selectedArrival: AdaptedArrival | null;
}

// Aircraft specification for class determination
export interface AircraftClass {
  modelFullName: string | null;
  description: string | null;
  wtc: string | null;
  wtg: string | null;
  designator: string | null;
  manufacturerCode: string | null;
  aircraftDescription: string | null;
  engineCount: string | null;
  engineType: string | null;
}

// IERR Capability hierarchy (lower enum value = higher capability)
export enum IERRCapability {
  ZOA_NONE = 0,
  ZOA_RNAV = 1,
  ZOA_VC_E2 = 2,
  ZOA_VC_A1 = 3,
  ZOA_VC_D1 = 4,
  ZOA_VC_D1A1 = 5,
  ZOA_GC_A1 = 6,
  ZOA_GC_D1 = 7,
  ZOA_GC_D1A1 = 8,
  ZOA_BC_A1 = 9,
  ZOA_BC_D1 = 10,
  ZOA_BC_D1A1 = 11,
}

/**
 * API-compatible types matching EDST for display purposes
 */
export interface ApiAdaptedDepartureArrivalRoute {
  route: string;
  departure: string;
  destination: string;
  eligible: boolean;
  rnavRequired: boolean;
  order: number;
  routeGroups: string[];
}

export interface ApiAdaptedDepartureRoute {
  departure: string;
  amendment: string;
  triggeredFix: string;
  eligible: boolean;
  rnavRequired: boolean;
  truncatedRoute: string;
  order: number;
  routeGroups: string[];
}

export interface ApiAdaptedArrivalRoute {
  destination: string;
  amendment: string;
  triggeredFix: string;
  eligible: boolean;
  rnavRequired: boolean;
  truncatedRoute: string;
  order: number;
  routeGroups: string[];
}

export type EdstAdaptedRoute =
  | (ApiAdaptedDepartureRoute & { routeType: "adr" })
  | (ApiAdaptedArrivalRoute & { routeType: "aar" })
  | (ApiAdaptedDepartureArrivalRoute & { routeType: "adar" });

// Flight data record interface matching what's needed for route analysis
export interface FlightDataRecord {
  callsign: string;
  aircraftType: string;
  departure: string;
  destination: string;
  route: string;
  altitude: string;
  remarks: string;
  equipment: string;
  status: "Proposed" | "Active" | "Tentative";
  parsedRoute?: ParsedRouteSegment[];
}

export interface ParsedRouteSegment {
  name: string;
  type: "WAYPOINT" | "AIRWAY" | "SID" | "STAR" | "DIRECT";
  distance?: number;
  latLong?: { lat: number; lon: number };
}

// Adapted routing data container
export interface AdaptedRoutingData {
  adaptedDepartureArrivals: AdaptedDepartureArrival[];
  adaptedDepartures: AdaptedDeparture[];
  adaptedArrivals: AdaptedArrival[];
  adaptedDepartureXLines: AdaptedDepartureXLine[];
  adaptedArrivalXLines: AdaptedArrivalXLine[];
}
