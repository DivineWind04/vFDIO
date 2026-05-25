/**
 * XML Parser Service for vNAS Adapted Routings
 * Parses XML files from NAS adaptations folder (H:\ATC tools\NAS\adaptations\ZOA)
 * Based on actual NAS XML format: ADR.xml, AAR.xml, ADAR.xml
 */

import type {
  AdaptedDepartureArrival,
  AdaptedDeparture,
  AdaptedArrival,
  AdaptedDepartureXLine,
  AdaptedArrivalXLine,
  AdaptedRoutingData,
  TransitionFix,
  TFixLocationType,
} from "../types/adaptedRouting/adaptedRoute";

const XML_BASE_PATH = "/api/adaptations"; // Configure this to your XML file server

// Parcel asset references — Parcel copies these files to dist/ and replaces the
// paths with content-hashed URLs that the dev server actually serves.
// This sidesteps Parcel's SPA-fallback returning HTML for unknown /api/ paths.
const ADAPTATION_ASSET_URLS: Partial<Record<string, { adar: string; adr: string; aar: string; atSpecialist: string; routeGroups: string }>> = {
  ZOA: {
    adar: new URL('../../api/adaptations/ZOA/ADAR.xml', import.meta.url).href,
    adr:  new URL('../../api/adaptations/ZOA/ADR.xml',  import.meta.url).href,
    aar:  new URL('../../api/adaptations/ZOA/AAR.xml',  import.meta.url).href,
    atSpecialist: new URL('../api/adaptations/ZOA/ATSpecialist.xml', import.meta.url).href,
    routeGroups:  new URL('../api/adaptations/ZOA/RouteGroups.xml',  import.meta.url).href,
  },
};

/**
 * Parse XML string to DOM Document
 */
function parseXmlString(xmlString: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  // Check for parser errors
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`XML parsing error: ${parserError.textContent}`);
  }

  return doc;
}

/**
 * Get text content from XML element, returning empty string if not found
 */
function getElementText(parent: Element, tagName: string): string {
  const element = parent.querySelector(tagName);
  return element?.textContent?.trim() ?? "";
}

/**
 * Get number from XML element, returning null if not found or invalid
 */
function getElementNumber(parent: Element, tagName: string): number | null {
  const text = getElementText(parent, tagName);
  if (!text) return null;
  const num = parseInt(text, 10);
  return isNaN(num) ? null : num;
}

/**
 * Get all text contents from multiple matching elements
 */
function getAllElementTexts(parent: Element, tagName: string): string[] {
  const elements = parent.querySelectorAll(tagName);
  return Array.from(elements).map((el) => el.textContent?.trim() ?? "").filter(Boolean);
}

/**
 * Parse route fixes from RouteFixList
 */
function parseRouteFixes(parent: Element): string[] {
  const fixList = parent.querySelector("RouteFixList");
  if (!fixList) return [];
  
  const fixes = fixList.querySelectorAll("RouteFix > FixName");
  return Array.from(fixes).map((el) => el.textContent?.trim() ?? "").filter(Boolean);
}

/**
 * Parse transition fixes from ADRTransitionFix/AARTransitionFix elements (names only)
 */
function parseTransitionFixes(parent: Element, prefix: string): string[] {
  const fixes = parent.querySelectorAll(`${prefix}TransitionFix > FixName`);
  return Array.from(fixes).map((el) => el.textContent?.trim() ?? "").filter(Boolean);
}

/**
 * Parse transition fixes with their TFixType and TFixRoute (for merge logic per §4.3.6.6)
 */
function parseTransitionFixList(parent: Element, prefix: string): TransitionFix[] {
  const elements = parent.querySelectorAll(`${prefix}TransitionFix`);
  const result: TransitionFix[] = [];
  elements.forEach((el) => {
    const name = el.querySelector('FixName')?.textContent?.trim() ?? '';
    if (!name) return;
    const rawType = el.querySelector('TFixType')?.textContent?.trim() ?? 'Append';
    const type = (['Append', 'Prepend', 'Explicit', 'Implicit'].includes(rawType)
      ? rawType
      : 'Append') as TFixLocationType;
    const tfixRoute = el.querySelector('TFixRoute')?.textContent?.trim() || undefined;
    result.push({ name, type, tfixRoute });
  });
  return result;
}

/**
 * Parse aircraft class criteria
 */
function parseAcClassCriteria(parent: Element, prefix: string): string[] {
  const criteria = parent.querySelectorAll(`${prefix}ACClassCriteriaList > AircraftClassCriteriaID`);
  return Array.from(criteria).map((el) => el.textContent?.trim() ?? "").filter(Boolean);
}

/**
 * Parse IERR criteria
 */
function parseIerrCriteria(parent: Element, prefix: string): string {
  const criteria = parent.querySelector(`${prefix}IERRCriteria > IERRCriteriaID`);
  return criteria?.textContent?.trim() ?? "";
}

/**
 * Parse airports from airport list
 */
function parseAirportList(parent: Element, listTag: string): string[] {
  const list = parent.querySelector(listTag);
  if (!list) return [];
  
  const airports = list.querySelectorAll("AirportID");
  return Array.from(airports).map((el) => el.textContent?.trim() ?? "").filter(Boolean);
}

/**
 * Parse ADAR (Adapted Departure Arrival Route) from XML element
 * Based on actual NAS XML: ADARRecord
 */
function parseAdaptedDepartureArrival(element: Element): AdaptedDepartureArrival {
  // Get route string from ADARAutoRouteAlphas > RouteString
  const routeString = getElementText(element, "ADARAutoRouteAlphas > RouteString") ||
                      getElementText(element, "RouteString");
  
  return {
    routeId: getElementText(element, "ADAR_ID"),
    textCommands: "",
    routeGroups: ["ZOA"], // NAS format uses facility ID
    order: getElementNumber(element, "Order"),
    autoRouteLimit: getElementNumber(element, "AutoRouteLimit"),
    lowerAltitude: getElementNumber(element, "LowerAltitude"),
    upperAltitude: getElementNumber(element, "UpperAltitude"),
    autoRouteAlphas: routeString,
    depAirports: parseAirportList(element, "ADARDepartureList").join(" "),
    arrAirports: parseAirportList(element, "ADARArrivalList").join(" "),
    acClassCriteria: parseAcClassCriteria(element, "ADAR").join(" "),
    ierrCriteria: parseIerrCriteria(element, "ADAR"),
    routeFixes: parseRouteFixes(element).join(" "),
    departureContentCriteria: "",
    destinationContentCriteria: "",
  };
}

/**
 * Parse ADR (Adapted Departure Route) from XML element
 * Based on actual NAS XML: ADRRecord
 */
function parseAdaptedDeparture(element: Element): AdaptedDeparture {
  // Get route string from ADRAutoRouteAlphas > RouteString
  const routeString = getElementText(element, "ADRAutoRouteAlphas > RouteString") ||
                      getElementText(element, "RouteString");
  
  return {
    routeId: getElementText(element, "ADR_ID"),
    textCommands: "",
    routeGroups: ["ZOA"], // NAS format uses facility ID
    order: getElementNumber(element, "Order"),
    autoRouteLimit: getElementNumber(element, "AutoRouteLimit"),
    lowerAltitude: getElementNumber(element, "LowerAltitude"),
    upperAltitude: getElementNumber(element, "UpperAltitude"),
    autoRouteAlphas: routeString,
    transitionFixes: parseTransitionFixes(element, "ADR").join(" "),
    transitionFixList: parseTransitionFixList(element, "ADR"),
    airports: parseAirportList(element, "ADRAirportList").join(" "),
    acClassCriteria: parseAcClassCriteria(element, "ADR").join(" "),
    ierrCriteria: parseIerrCriteria(element, "ADR"),
    xLines: "", // XLines handled separately if needed
    routeFixes: parseRouteFixes(element).join(" "),
    departureContentCriteria: "",
  };
}

/**
 * Parse AAR (Adapted Arrival Route) from XML element
 * Based on actual NAS XML: AARRecord
 */
function parseAdaptedArrival(element: Element): AdaptedArrival {
  // Get route string from AARAutoRouteAlphas > RouteString
  const routeString = getElementText(element, "AARAutoRouteAlphas > RouteString") ||
                      getElementText(element, "RouteString");
  
  return {
    routeId: getElementText(element, "AAR_ID"),
    textCommands: "",
    routeGroups: ["ZOA"], // NAS format uses facility ID
    order: getElementNumber(element, "Order"),
    autoRouteLimit: getElementNumber(element, "AutoRouteLimit"),
    lowerAltitude: getElementNumber(element, "LowerAltitude"),
    upperAltitude: getElementNumber(element, "UpperAltitude"),
    autoRouteAlphas: routeString,
    transitionFixes: parseTransitionFixes(element, "AAR").join(" "),
    transitionFixList: parseTransitionFixList(element, "AAR"),
    airports: parseAirportList(element, "AARAirportList").join(" "),
    acClassCriteria: parseAcClassCriteria(element, "AAR").join(" "),
    ierrCriteria: parseIerrCriteria(element, "AAR"),
    xLines: "", // XLines handled separately if needed
    routeFixes: parseRouteFixes(element).join(" "),
    destinationContentCriteria: "",
  };
}

/**
 * Parse ADR XLine from XML element
 */
function parseAdaptedDepartureXLine(element: Element): AdaptedDepartureXLine {
  return {
    adrId: getElementText(element, "ADRID"),
    xLineId: getElementText(element, "XLineID"),
    xLineLowerAltitude: getElementNumber(element, "XLineLowerAltitude"),
    xLineUpperAltitude: getElementNumber(element, "XLineUpperAltitude"),
    xLineDistance: getElementText(element, "XLineDistance"),
    tFix: getElementText(element, "TFix"),
    xLineAirports: getElementText(element, "XLineAirports"),
    xLineAcClassCriteria: getElementText(element, "XLineACClassCriteria"),
    coordinates: getElementText(element, "Coordinates"),
  };
}

/**
 * Parse AAR XLine from XML element
 */
function parseAdaptedArrivalXLine(element: Element): AdaptedArrivalXLine {
  return {
    aarId: getElementText(element, "AARID"),
    xLineId: getElementText(element, "XLineID"),
    xLineLowerAltitude: getElementNumber(element, "XLineLowerAltitude"),
    xLineUpperAltitude: getElementNumber(element, "XLineUpperAltitude"),
    xLineDistance: getElementText(element, "XLineDistance"),
    tFix: getElementText(element, "TFix"),
    xLineAirports: getElementText(element, "XLineAirports"),
    xLineAcClassCriteria: getElementText(element, "XLineACClassCriteria"),
    coordinates: getElementText(element, "Coordinates"),
  };
}

/**
 * Parsed ATSpecialist CommandListAdapt configuration
 */
export interface ATSpecialistConfig {
  name: string;
  activeGroups: string[];  // route group IDs that are ON (e.g. '02', '10')
  activeRoutes: string[];  // named routes that are /ON (e.g. 'BMM7J', 'LPMOR')
}

/**
 * Parse ATSpecialist.xml into a map of config name → ATSpecialistConfig
 *
 * Only processes CommandText entries of these forms (all others are ignored):
 *   SA <id>ON   → route group <id> is active
 *   SA <id>OFF  → route group <id> is inactive
 *   SA <name>/ON  → named route is active
 *   SA <name>/OFF → named route is inactive
 */
export function parseAtSpecialistXml(xmlContent: string): Map<string, ATSpecialistConfig> {
  const doc = parseXmlString(xmlContent);
  const configs = new Map<string, ATSpecialistConfig>();

  const adapts = doc.querySelectorAll('CommandListAdapt');
  adapts.forEach((adapt) => {
    const name = adapt.querySelector('CommandListName')?.textContent?.trim();
    if (!name) return;

    const activeGroups: string[] = [];
    const activeRoutes: string[] = [];

    const commands = adapt.querySelectorAll('CommandList > CommandText');
    commands.forEach((cmd) => {
      const text = cmd.textContent?.trim() ?? '';

      // Only handle bare SA commands: SA <token>ON/OFF or SA <token>/ON  /OFF
      // Ignore: CS, PF, GI, & (comment), SA APR ...
      if (!text.startsWith('SA ')) return;
      const token = text.slice(3).trim();
      if (!token || token.startsWith('APR ')) return;

      // Named route: SA BMM7J/ON or SA LPMOR/OFF
      if (token.includes('/')) {
        const slash = token.lastIndexOf('/');
        const id = token.slice(0, slash).trim();
        const state = token.slice(slash + 1).trim().toUpperCase();
        if (state === 'ON') activeRoutes.push(id);
        return;
      }

      // Route group: SA 02ON or SA 00OFF
      const onMatch = /^(\S+?)ON$/i.exec(token);
      const offMatch = /^(\S+?)OFF$/i.exec(token);
      if (onMatch) activeGroups.push(onMatch[1]);
      if (offMatch) {
        const idx = activeGroups.indexOf(offMatch[1]);
        if (idx !== -1) activeGroups.splice(idx, 1);
      }
    });

    configs.set(name, { name, activeGroups, activeRoutes });
  });

  return configs;
}

/**
 * Load ATSpecialist configs for an ARTCC from its XML file
 */
export async function loadAtSpecialistConfigs(
  artccId: string = 'ZOA'
): Promise<Map<string, ATSpecialistConfig>> {
  const assetUrls = ADAPTATION_ASSET_URLS[artccId];
  const url = assetUrls?.atSpecialist ?? `/api/adaptations/${artccId}/ATSpecialist.xml`;
  try {
    const xml = await fetchXmlFile(url);
    const configs = parseAtSpecialistXml(xml);
    console.log(`[AdaptedRouting] Loaded ${configs.size} ATSpecialist configs for ${artccId}`);
    return configs;
  } catch (err) {
    console.warn('[AdaptedRouting] Failed to load ATSpecialist.xml:', err);
    return new Map();
  }
}

/**
 * Parse RouteGroups.xml — builds a map of routeId → numeric group IDs[]
 */
export function parseRouteGroupsXml(xmlContent: string): Map<string, string[]> {
  const doc = parseXmlString(xmlContent);
  const groupMap = new Map<string, string[]>();

  doc.querySelectorAll('RG_Record').forEach((rgRecord) => {
    const groupId = rgRecord.querySelector('RouteGroupID')?.textContent?.trim();
    if (!groupId) return;

    rgRecord.querySelectorAll('Route_Record > RouteId').forEach((el) => {
      const routeId = el.textContent?.trim();
      if (!routeId) return;
      const existing = groupMap.get(routeId);
      if (existing) {
        existing.push(groupId);
      } else {
        groupMap.set(routeId, [groupId]);
      }
    });
  });

  return groupMap;
}

/**
 * Parse ADAR XML file (NAS format: ADAR_Records > ADARRecord)
 */
export async function parseAdarXml(xmlContent: string): Promise<AdaptedDepartureArrival[]> {
  const doc = parseXmlString(xmlContent);
  const routes: AdaptedDepartureArrival[] = [];

  // NAS format uses ADARRecord elements
  const elements = doc.querySelectorAll("ADARRecord");

  elements.forEach((element) => {
    try {
      routes.push(parseAdaptedDepartureArrival(element));
    } catch (e) {
      console.warn("Failed to parse ADAR element:", e);
    }
  });

  return routes;
}

/**
 * Parse ADR XML file (NAS format: ADR_Records > ADRRecord)
 */
export async function parseAdrXml(xmlContent: string): Promise<AdaptedDeparture[]> {
  const doc = parseXmlString(xmlContent);
  const routes: AdaptedDeparture[] = [];

  // NAS format uses ADRRecord elements
  const elements = doc.querySelectorAll("ADRRecord");

  elements.forEach((element) => {
    try {
      routes.push(parseAdaptedDeparture(element));
    } catch (e) {
      console.warn("Failed to parse ADR element:", e);
    }
  });

  return routes;
}

/**
 * Parse AAR XML file (NAS format: AAR_Records > AARRecord)
 */
export async function parseAarXml(xmlContent: string): Promise<AdaptedArrival[]> {
  const doc = parseXmlString(xmlContent);
  const routes: AdaptedArrival[] = [];

  // NAS format uses AARRecord elements
  const elements = doc.querySelectorAll("AARRecord");

  elements.forEach((element) => {
    try {
      routes.push(parseAdaptedArrival(element));
    } catch (e) {
      console.warn("Failed to parse AAR element:", e);
    }
  });

  return routes;
}

/**
 * Parse ADR XLines XML file
 */
export async function parseAdrXLineXml(xmlContent: string): Promise<AdaptedDepartureXLine[]> {
  const doc = parseXmlString(xmlContent);
  const xLines: AdaptedDepartureXLine[] = [];

  const elements = doc.querySelectorAll("XLine, ADR_XLine");

  elements.forEach((element) => {
    try {
      xLines.push(parseAdaptedDepartureXLine(element));
    } catch (e) {
      console.warn("Failed to parse ADR XLine element:", e);
    }
  });

  return xLines;
}

/**
 * Parse AAR XLines XML file
 */
export async function parseAarXLineXml(xmlContent: string): Promise<AdaptedArrivalXLine[]> {
  const doc = parseXmlString(xmlContent);
  const xLines: AdaptedArrivalXLine[] = [];

  const elements = doc.querySelectorAll("XLine, AAR_XLine");

  elements.forEach((element) => {
    try {
      xLines.push(parseAdaptedArrivalXLine(element));
    } catch (e) {
      console.warn("Failed to parse AAR XLine element:", e);
    }
  });

  return xLines;
}

/**
 * Fetch XML file from URL
 */
async function fetchXmlFile(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch XML: ${response.status} ${response.statusText} — ${url}`);
  }
  const text = await response.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
    throw new Error(`Got HTML instead of XML from ${url} — Parcel may not be serving this file`);
  }
  return text;
}

/**
 * Load all adapted routing data from XML files
 * @param basePath The base path where XML files are served
 * @param artccId The ARTCC identifier (e.g., "ZOA")
 */
export async function loadAdaptedRoutingData(
  basePath: string = XML_BASE_PATH,
  artccId: string = "ZOA"
): Promise<AdaptedRoutingData> {
  const folder = `${basePath}/${artccId}`;
  const assetUrls = ADAPTATION_ASSET_URLS[artccId];

  try {
    // Load all XML files in parallel
    const fetchWithLog = (url: string) =>
      fetchXmlFile(url).catch((err) => {
        console.warn(`[AdaptedRouting] Failed to fetch ${url}:`, err.message);
        return "";
      });

    // Prefer Parcel-bundled asset URLs (avoids SPA-fallback HTML problem);
    // fall back to constructed HTTP path for artccIds without bundled assets.
    const adarUrl       = assetUrls?.adar        ?? `${folder}/ADAR.xml`;
    const adrUrl        = assetUrls?.adr         ?? `${folder}/ADR.xml`;
    const aarUrl        = assetUrls?.aar         ?? `${folder}/AAR.xml`;
    const routeGroupsUrl = assetUrls?.routeGroups ?? `${folder}/RouteGroups.xml`;

    console.log(`[AdaptedRouting] Fetching: ADAR=${adarUrl}`);

    const [adarXml, adrXml, aarXml, adrXLineXml, aarXLineXml, routeGroupsXml] = await Promise.all([
      fetchWithLog(adarUrl),
      fetchWithLog(adrUrl),
      fetchWithLog(aarUrl),
      fetchWithLog(`${folder}/ADR_XLine.xml`),
      fetchWithLog(`${folder}/AAR_XLine.xml`),
      fetchWithLog(routeGroupsUrl),
    ]);

    console.log(`[AdaptedRouting] Loaded from ${folder}: ADAR=${adarXml.length > 0} ADR=${adrXml.length > 0} AAR=${aarXml.length > 0} RouteGroups=${routeGroupsXml.length > 0}`);

    // Parse each file individually so one bad file doesn't kill the rest
    const parseWithLog = async <T>(name: string, content: string, parser: (s: string) => Promise<T[]>): Promise<T[]> => {
      if (!content) return [];
      try {
        const result = await parser(content);
        console.log(`[AdaptedRouting] Parsed ${name}: ${result.length} records`);
        return result;
      } catch (err) {
        console.warn(`[AdaptedRouting] Failed to parse ${name}:`, err);
        return [];
      }
    };

    // Build routeId→groupIds map from RouteGroups.xml
    let groupMap = new Map<string, string[]>();
    if (routeGroupsXml) {
      try {
        groupMap = parseRouteGroupsXml(routeGroupsXml);
        console.log(`[AdaptedRouting] RouteGroups: ${groupMap.size} route→group mappings`);
      } catch (err) {
        console.warn('[AdaptedRouting] Failed to parse RouteGroups.xml:', err);
      }
    }

    const [
      adaptedDepartureArrivals,
      adaptedDepartures,
      adaptedArrivals,
      adaptedDepartureXLines,
      adaptedArrivalXLines,
    ] = await Promise.all([
      parseWithLog("ADAR", adarXml, parseAdarXml),
      parseWithLog("ADR", adrXml, parseAdrXml),
      parseWithLog("AAR", aarXml, parseAarXml),
      parseWithLog("ADR_XLine", adrXLineXml, parseAdrXLineXml),
      parseWithLog("AAR_XLine", aarXLineXml, parseAarXLineXml),
    ]);

    // Populate routeGroups from map and sort by order (lowest order = highest priority)
    if (groupMap.size > 0) {
      for (const r of adaptedDepartureArrivals) r.routeGroups = groupMap.get(r.routeId) ?? [];
      for (const r of adaptedDepartures)        r.routeGroups = groupMap.get(r.routeId) ?? [];
      for (const r of adaptedArrivals)          r.routeGroups = groupMap.get(r.routeId) ?? [];
    }
    adaptedDepartureArrivals.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    adaptedDepartures.sort((a, b)        => (a.order ?? 0) - (b.order ?? 0));
    adaptedArrivals.sort((a, b)          => (a.order ?? 0) - (b.order ?? 0));

    return {
      adaptedDepartureArrivals,
      adaptedDepartures,
      adaptedArrivals,
      adaptedDepartureXLines,
      adaptedArrivalXLines,
    };
  } catch (error) {
    console.warn("[AdaptedRouting] Failed to load adapted routing data:", error);
    return {
      adaptedDepartureArrivals: [],
      adaptedDepartures: [],
      adaptedArrivals: [],
      adaptedDepartureXLines: [],
      adaptedArrivalXLines: [],
    };
  }
}

/**
 * Load from file input (for local file loading in development)
 */
export function loadFromFileInput(files: FileList): Promise<AdaptedRoutingData> {
  const data: AdaptedRoutingData = {
    adaptedDepartureArrivals: [],
    adaptedDepartures: [],
    adaptedArrivals: [],
    adaptedDepartureXLines: [],
    adaptedArrivalXLines: [],
  };

  const filePromises = Array.from(files).map(async (file) => {
    const content = await file.text();
    const fileName = file.name.toLowerCase();

    if (fileName.includes("adar")) {
      data.adaptedDepartureArrivals = await parseAdarXml(content);
    } else if (fileName.includes("adr_xline") || fileName.includes("adr-xline")) {
      data.adaptedDepartureXLines = await parseAdrXLineXml(content);
    } else if (fileName.includes("adr")) {
      data.adaptedDepartures = await parseAdrXml(content);
    } else if (fileName.includes("aar_xline") || fileName.includes("aar-xline")) {
      data.adaptedArrivalXLines = await parseAarXLineXml(content);
    } else if (fileName.includes("aar")) {
      data.adaptedArrivals = await parseAarXml(content);
    }
  });

  return Promise.all(filePromises).then(() => data);
}
