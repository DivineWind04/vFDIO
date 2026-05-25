import type { ApiFlightplan, CreateOrAmendFlightplanDto } from '../types/apiTypes/apiFlightplan';
import { formatStripFromFieldValues } from '../utils/stripFormatter';
import { findBestRouteForFlightplan, buildAmendDto } from './autoAdaptedRoutingProcessor';
import { stripAdaptedRoute } from './adaptedRoutingService';
import type { ATSpecialistConfig } from './adaptedRoutingXmlParser';

export interface CommandContext {
  flightplans: Map<string, ApiFlightplan>;
  flightStrips: Map<string, any>;
  amendFlightplan: (fp: CreateOrAmendFlightplanDto) => Promise<void>;
  deleteFlightplan: (aircraftId: string) => Promise<void>;
  requestFlightStrip: (aircraftId: string) => Promise<void>;
  sendCommand: (command: string) => Promise<string>;
  responseBottom: string;
  setResponseTop: (value: string) => void;
  setResponseBottom: (value: string) => void;
  setActiveRouteGroups: (groups: string[]) => void;
  setActiveConfiguration: (config: string | null) => void;
  activeConfiguration: string | null;
  atSpecialistConfigs: Map<string, ATSpecialistConfig>;
}

function findFlightplan(identifier: string, flightplans: Map<string, ApiFlightplan>): ApiFlightplan | undefined {
  // Try direct callsign match first
  let fp = flightplans.get(identifier);
  if (fp) return fp;

  // Search by CID or beacon code
  for (const [, flightplan] of flightplans) {
    if (flightplan.cid === identifier ||
      flightplan.assignedBeaconCode?.toString() === identifier) {
      return flightplan;
    }
  }

  return undefined;
}

async function handleFP(input: string, ctx: CommandContext): Promise<string> {
  const fpMatch = /^FP\s+(.+)$/i.exec(input.trim());
  if (!fpMatch) {
    return `REJECT 01 MSG INVALID\nMESSAGE TYPE`;
  }

  const fields = fpMatch[1].split(/\s+/);
  if (fields.length < 7) {
    return `REJECT FORMAT - INSUFFICIENT FIELDS\n${input}`;
  }

  // Field 02: Aircraft ID
  const aircraftId = fields[0];
  if (aircraftId.length < 2 || aircraftId.length > 20) {
    return `REJECT 02 AID FLID\nFORMAT`;
  }

  // Field 03: Aircraft Type / Equipment Suffix
  const typeEquipMatch = fields[1].match(/^([A-Z0-9]+)\/([A-Z])$/);
  if (!typeEquipMatch) {
    return `REJECT 03 TYP FORMAT`;
  }
  const aircraftType = typeEquipMatch[1];
  const equipmentSuffix = typeEquipMatch[2];

  // Field 05: Speed
  const speed = parseInt(fields[2]);
  if (isNaN(speed) || speed <= 0) {
    return `REJECT 05 SPD ILLEGAL`;
  }
  if (speed > 3700) {
    return `REJECT 05 SPD FORMAT`;
  }

  // Field 06: Departure Fix (Coordination Fix)
  const departureFix = fields[3];
  if (departureFix.length < 2 || departureFix.length > 12) {
    return `REJECT 06 FIX FORMAT`;
  }

  // Field 07: Time
  const timeStr = fields[4];
  let departureTime = 0;
  if (timeStr !== 'E' && timeStr !== 'P' && timeStr !== 'D') {
    const timeMatch = timeStr.match(/^[PE]?(\d{4})$/);
    if (!timeMatch) {
      return `REJECT 07 TIM FORMAT`;
    }
    departureTime = parseInt(timeMatch[1]);
  }

  // Field 08 or 09: Altitude (Assigned or Requested)
  const altStr = fields[5];
  let altitude = '';
  if (altStr === 'OTP' || altStr === 'VFR') {
    altitude = altStr;
  } else {
    const altMatch = altStr.match(/^(\d+|OTP|VFR)(\/(\d+))?$/);
    if (!altMatch) {
      return `REJECT 08 ALT FORMAT`;
    }
    altitude = altStr;
  }

  // Field 10: Route - everything from field 6 onwards until we hit remarks
  let routeEndIdx = 6;
  for (let i = 6; i < fields.length; i++) {
    if (fields[i].startsWith('O') || fields[i].startsWith('@')) {
      routeEndIdx = i;
      break;
    }
    routeEndIdx = i + 1;
  }

  const routeParts = fields.slice(6, routeEndIdx);
  if (routeParts.length === 0) {
    return `REJECT 10 RTE FORMAT`;
  }
  const route = routeParts.join(' ');

  // Field 11: Remarks (optional)
  let remarks = '';
  if (routeEndIdx < fields.length) {
    const remarksFields = fields.slice(routeEndIdx);
    const remarksStr = remarksFields.join(' ');
    if (remarksStr.startsWith('O ')) {
      remarks = remarksStr.substring(2);
    } else if (remarksStr.startsWith('@')) {
      remarks = remarksStr.substring(1);
    } else {
      remarks = remarksStr;
    }
  }

  try {
    const existingFp = ctx.flightplans.get(aircraftId);
    if (existingFp && existingFp.status === 'Active') {
      return `REJECT 02 AID FLID\nDUPLICATION`;
    }

    await ctx.amendFlightplan({
      aircraftId,
      cid: '',
      status: 'Proposed',
      aircraftType,
      faaEquipmentSuffix: equipmentSuffix,
      equipment: `${aircraftType}/${equipmentSuffix}`,
      icaoEquipmentCodes: '',
      icaoSurveillanceCodes: '',
      speed,
      altitude,
      departure: departureFix,
      destination: '',
      alternate: '',
      route,
      remarks,
      assignedBeaconCode: null,
      estimatedDepartureTime: departureTime,
      actualDepartureTime: 0,
      hoursEnroute: 0,
      minutesEnroute: 0,
      fuelHours: 0,
      fuelMinutes: 0,
      pilotCid: '',
      holdAnnotations: null,
      wakeTurbulenceCode: '',
    });

    return `ACCEPT\n${aircraftId}`;
  } catch (error) {
    console.error('Failed to create flightplan:', error);
    const errorStr = String(error);
    if (errorStr.includes('Not your control') || errorStr.includes('inactive session')) {
      return `REJECT 01 MSG ILLEGAL\nSOURCE`;
    } else {
      return `REJECT FP ENTRY FAILED`;
    }
  }
}

async function handleAM(input: string, ctx: CommandContext): Promise<string> {
  const amMatch = /^AM\s+(.+)$/i.exec(input.trim());
  if (!amMatch) {
    return `REJECT 01 MSG INVALID\nMESSAGE TYPE`;
  }

  const parts = amMatch[1].split(/\s+/);
  if (parts.length < 3) {
    return `REJECT FORMAT - INSUFFICIENT FIELDS\n${input}`;
  }

  const aircraftId = parts[0];
  const existingFp = findFlightplan(aircraftId, ctx.flightplans);
  if (!existingFp) {
    return `REJECT 02 FLID NOT\nSTORED`;
  }

  const amendments: { [key: string]: any } = {};
  let i = 1;

  const fieldMap: { [key: string]: string } = {
    'AID': '02', '02': '02', '2': '02',
    'TYP': '03', '03': '03', '3': '03',
    'BCN': '04', '04': '04', '4': '04',
    'SPD': '05', '05': '05', '5': '05',
    'FIX': '06', '06': '06', '6': '06',
    'TIM': '07', '07': '07', '7': '07',
    'ALT': '08', '08': '08', '8': '08',
    'RAL': '09', '09': '09', '9': '09',
    'RTE': '10', '10': '10',
    'RMK': '11', '11': '11'
  };

  while (i < parts.length) {
    const fieldRef = parts[i].toUpperCase();
    const fieldNum = fieldMap[fieldRef];
    if (!fieldNum) {
      return `REJECT INVALID FIELD\nREFERENCE`;
    }

    i++;
    if (i >= parts.length) {
      return `REJECT FORMAT - MISSING AMENDMENT DATA\n${input}`;
    }

    // Check if amending Field 02 (Aircraft ID)
    if (fieldNum === '02') {
      if (Object.keys(amendments).length > 0) {
        return `REJECT - INVALID\nAMENDMENT`;
      }
      amendments['aircraftId'] = parts[i];
      i++;
      break; // Only Field 02 can be amended when changing aircraft ID
    }

    // Collect amendment data for this field
    let amendmentData: string[] = [];

    // For route (10/RTE), collect all remaining parts until we hit another field ref or end
    if (fieldNum === '10') {
      while (i < parts.length) {
        const nextToken = parts[i].toUpperCase();
        if (fieldMap[nextToken]) {
          break;
        }
        amendmentData.push(parts[i]);
        i++;
      }

      if (amendmentData.length === 0) {
        return `REJECT 10 RTE FORMAT`;
      }

      const routeStr = amendmentData.join(' ');
      const existingRoute = existingFp.route || '';
      const routeElements = routeStr.split(/[\s.]+/).filter(e => e.length > 0);

      // Check for departure fix change (single element followed by ↑)
      if (routeStr.endsWith('↑') || routeStr.endsWith('^')) {
        const newDepFix = routeStr.slice(0, -1).trim().split(/[\s.]+/)[0];
        amendments['departure'] = newDepFix;
        amendments['route'] = routeStr.slice(0, -1).trim();
      }
      // Check for complete replacement (ends with ↓)
      else if (routeStr.endsWith('↓') || routeStr.endsWith('v')) {
        const newRoute = routeStr.slice(0, -1).trim();
        const newRouteElements = newRoute.split(/[\s.]+/).filter(e => e.length > 0);
        if (newRouteElements.length > 0) {
          amendments['destination'] = newRouteElements[newRouteElements.length - 1];
          if (existingFp.status === 'Active' && existingFp.departure) {
            amendments['route'] = `${existingFp.departure}/.${newRoute}`;
          } else {
            amendments['route'] = newRoute;
          }
        } else {
          return `REJECT 10 RTE FORMAT`;
        }
      }
      // Tailoring symbol at beginning (/) - insert after departure fix
      else if (routeStr.startsWith('/')) {
        const tailoredRoute = routeStr.substring(1).trim();
        if (existingFp.departure) {
          amendments['route'] = `${existingFp.departure}/.${tailoredRoute}`;
        } else {
          amendments['route'] = tailoredRoute;
        }
      }
      // Merge with existing route
      else {
        const firstElement = routeElements[0];
        const lastElement = routeElements[routeElements.length - 1];
        const existingElements = existingRoute.split(/[\s.]+/).filter(e => e.length > 0);

        const firstMatchIdx = existingElements.indexOf(firstElement);
        const lastMatchIdx = existingElements.lastIndexOf(lastElement);

        if (firstMatchIdx !== -1 && lastMatchIdx !== -1 && firstMatchIdx < lastMatchIdx) {
          const before = existingElements.slice(0, firstMatchIdx).join('.');
          const after = existingElements.slice(lastMatchIdx + 1).join('.');
          const merged = [before, routeStr, after].filter(p => p.length > 0).join('.');
          amendments['route'] = merged;
        }
        else if (firstMatchIdx !== -1) {
          const before = existingElements.slice(0, firstMatchIdx + 1).join('.');
          amendments['route'] = `${before}.${routeElements.slice(1).join('.')}`;
        }
        else if (lastMatchIdx !== -1) {
          const after = existingElements.slice(lastMatchIdx).join('.');
          if (existingFp.status === 'Active' && existingFp.departure) {
            amendments['route'] = `${existingFp.departure}/.${routeElements.slice(0, -1).join('.')}.${after}`;
          } else {
            amendments['route'] = `${routeElements.slice(0, -1).join('.')}.${after}`;
          }
        }
        else {
          amendments['route'] = routeStr;
        }
      }
    }
    // For other fields, just take the next token
    else {
      amendmentData.push(parts[i]);
      i++;

      const value = amendmentData[0];

      switch (fieldNum) {
        case '03': { // Type/Equipment
          const typeMatch = value.match(/^([A-Z0-9]+)\/([A-Z])$/);
          if (!typeMatch) {
            return `REJECT 03 TYP FORMAT`;
          }
          const newAircraftType = typeMatch[1];
          const newFaaEquipmentSuffix = typeMatch[2];

          let newEquipment = `${newAircraftType}/${newFaaEquipmentSuffix}`;
          if (existingFp.equipment) {
            const firstSlashIndex = existingFp.equipment.indexOf('/');
            if (firstSlashIndex > 0) {
              const everythingAfterSlash = existingFp.equipment.substring(firstSlashIndex + 1);
              newEquipment = `${newAircraftType}/${everythingAfterSlash}`;
            }
          }

          amendments['equipment'] = newEquipment;
          amendments['faaEquipmentSuffix'] = newFaaEquipmentSuffix;
          break;
        }

        case '04': { // Beacon Code
          const beaconCode = parseInt(value);
          if (isNaN(beaconCode) || beaconCode < 0 || beaconCode > 7777) {
            return `REJECT 04 BCN CODE FORMAT`;
          }
          amendments['assignedBeaconCode'] = beaconCode;
          break;
        }

        case '05': { // Speed
          const speed = parseInt(value);
          if (isNaN(speed) || speed <= 0) {
            return `REJECT 05 SPD ILLEGAL`;
          }
          if (speed > 3700) {
            return `REJECT 05 SPD FORMAT`;
          }
          amendments['speed'] = speed;
          break;
        }

        case '06': // Departure Fix
          if (value.length < 2 || value.length > 12) {
            return `REJECT 06 FIX FORMAT`;
          }
          amendments['departure'] = value;
          break;

        case '07': { // Time
          if (value !== 'E' && value !== 'P' && value !== 'D') {
            const timeMatch = value.match(/^[PE]?(\d{4})$/);
            if (!timeMatch) {
              return `REJECT 07 TIM FORMAT`;
            }
            amendments['estimatedDepartureTime'] = parseInt(timeMatch[1]);
          }
          break;
        }

        case '08': // Assigned Altitude
          amendments['altitude'] = value;
          break;

        case '09': // Requested Altitude (RAL)
          amendments['altitude'] = value;
          break;

        case '11': { // Remarks
          while (i < parts.length) {
            const nextToken = parts[i].toUpperCase();
            if (fieldMap[nextToken]) {
              break;
            }
            amendmentData.push(parts[i]);
            i++;
          }
          let remarks = amendmentData.join(' ');
          if (remarks.startsWith('O ')) {
            remarks = remarks.substring(2);
          } else if (remarks.startsWith('@')) {
            remarks = remarks.substring(1);
          }
          amendments['remarks'] = remarks;
          break;
        }
      }
    }
  }

  if (Object.keys(amendments).length === 0) {
    return `REJECT FORMAT - NO VALID AMENDMENTS\n${input}`;
  }

  try {
    const amendDto: CreateOrAmendFlightplanDto = {
      aircraftId: amendments['aircraftId'] || existingFp.aircraftId,
      cid: existingFp.cid,
      status: existingFp.status,
      aircraftType: amendments['aircraftType'] || existingFp.aircraftType,
      faaEquipmentSuffix: amendments['faaEquipmentSuffix'] || existingFp.faaEquipmentSuffix,
      equipment: amendments['equipment'] || existingFp.equipment,
      icaoEquipmentCodes: existingFp.icaoEquipmentCodes,
      icaoSurveillanceCodes: existingFp.icaoSurveillanceCodes,
      speed: amendments['speed'] ?? existingFp.speed,
      altitude: amendments['altitude'] || existingFp.altitude,
      departure: amendments['departure'] || existingFp.departure,
      destination: amendments['destination'] || existingFp.destination,
      alternate: existingFp.alternate,
      route: amendments['route'] || existingFp.route,
      remarks: amendments['remarks'] !== undefined ? amendments['remarks'] : existingFp.remarks,
      assignedBeaconCode: amendments['assignedBeaconCode'] ?? existingFp.assignedBeaconCode,
      estimatedDepartureTime: amendments['estimatedDepartureTime'] ?? existingFp.estimatedDepartureTime,
      actualDepartureTime: existingFp.actualDepartureTime,
      hoursEnroute: existingFp.hoursEnroute,
      minutesEnroute: existingFp.minutesEnroute,
      fuelHours: existingFp.fuelHours,
      fuelMinutes: existingFp.fuelMinutes,
      pilotCid: existingFp.pilotCid,
      holdAnnotations: existingFp.holdAnnotations,
      wakeTurbulenceCode: existingFp.wakeTurbulenceCode,
    };

    console.log('AM Command Debug:');
    console.log('  Amendments:', amendments);
    console.log('  Existing FP equipment:', existingFp.equipment);
    console.log('  Existing FP faaEquipmentSuffix:', existingFp.faaEquipmentSuffix);
    console.log('  New equipment:', amendDto.equipment);
    console.log('  New faaEquipmentSuffix:', amendDto.faaEquipmentSuffix);

    await ctx.amendFlightplan(amendDto);

    return `ACCEPT ${amendDto.aircraftId}/${amendDto.cid}`;
  } catch (error) {
    console.error('Failed to amend flightplan:', error);
    const errorStr = String(error);
    if (errorStr.includes('Not your control') || errorStr.includes('inactive session')) {
      return `REJECT 01 MSG ILLEGAL\nSOURCE`;
    } else {
      return `REJECT - INVALID\nAMENDMENT`;
    }
  }
}

function handleGI(input: string): string {
  const giMatch = /^GI\s+(\S+)\s+(.+)$/i.exec(input.trim());
  if (giMatch && giMatch.length === 3) {
    const recipient = giMatch[1].toUpperCase();
    const message = giMatch[2];
    return `ACCEPT GI TO ${recipient}\n${message}`;
  } else {
    return `REJECT FORMAT\n${input}`;
  }
}

async function handleWR(input: string, args: string[]): Promise<string> {
  if (args.length !== 1) {
    return `REJECT FORMAT\n${input}`;
  }
  const station = args[0];

  try {
    const response = await fetch(
      `https://metar.vatsim.net/${encodeURIComponent(station)}`
    );

    if (!response.ok) {
      return `REJECT WEATHER STAT REQ\nSTATION NOT FOUND`;
    }

    const metar = await response.text();

    if (!metar || metar.trim() === '' || metar.includes('No METAR')) {
      return `REJECT WEATHER STAT REQ\nNO DATA FOR ${station}`;
    }

    return `ACCEPT WEATHER STAT REQ\n${metar.trim()}`;
  } catch (error) {
    console.error('Failed to fetch METAR:', error);
    return `REJECT WEATHER STAT REQ\nFETCH FAILED`;
  }
}

async function handleSR(input: string, args: string[], ctx: CommandContext): Promise<string> {
  if (args.length !== 1) {
    return `REJECT FORMAT\n${input}`;
  }
  const identifier = args[0];

  let aircraftId = identifier;
  let strip = ctx.flightStrips?.get(identifier);

  if (!strip && ctx.flightStrips) {
    for (const [id, s] of ctx.flightStrips) {
      if (s.fieldValues && (
        s.fieldValues[0] === identifier ||
        s.fieldValues[4] === identifier ||
        s.fieldValues[5] === identifier)) {
        strip = s;
        aircraftId = id;
        break;
      }
    }
  }

  // Always request from server first - this triggers ReceiveStripItems event
  try {
    console.log('SR: Requesting flight strip for:', aircraftId);
    await ctx.requestFlightStrip(aircraftId);
    console.log('SR: RequestFlightStrip succeeded for:', aircraftId);
  } catch (error) {
    console.warn('SR: RequestFlightStrip failed:', error);
    if (!strip?.fieldValues) {
      return `REJECT\nSTRIP NOT FOUND\n${input}`;
    }
  }

  // If we have a local copy, display it immediately (server response will update via ReceiveStripItems)
  if (strip?.fieldValues) {
    const formattedStrip = formatStripFromFieldValues(strip.fieldValues);

    // Print the strip (move responseBottom to responseTop, set new strip to responseBottom)
    ctx.setResponseTop(ctx.responseBottom);
    ctx.setResponseBottom(formattedStrip);

    return formattedStrip;
  }

  // No local strip but server request succeeded - strip will arrive via ReceiveStripItems event
  return `ACCEPT SR ${identifier}\nSTRIP REQUESTED`;
}

function handleFR(input: string, args: string[], ctx: CommandContext): string {
  if (args.length !== 1) {
    return `REJECT FORMAT\n${input}`;
  }
  const identifier = args[0];
  const flightplan = findFlightplan(identifier, ctx.flightplans);

  if (flightplan) {
    const cid = flightplan.cid || '';
    const aircraftId = flightplan.aircraftId || '';
    const aircraftType = flightplan.aircraftType || '';
    const beaconCode = flightplan.assignedBeaconCode?.toString() || '';
    const speed = flightplan.speed || '';
    const time = ('P' + flightplan.estimatedDepartureTime) || '';
    const altitude = flightplan.altitude || '';
    const departure = flightplan.departure || '';
    const destination = flightplan.destination || '';
    const remarks = flightplan.remarks || '';
    const route = flightplan.route || '';

    return `${cid} ${aircraftId} ${aircraftType} ${beaconCode} ${speed} ${time} ${altitude} ${departure} ${route} ${destination} ${remarks}`;
  } else {
    return `FLID NOT STORED\n${input}`;
  }
}

async function handleRS(input: string, args: string[], ctx: CommandContext): Promise<string> {
  if (args.length !== 1) {
    return `REJECT FORMAT\n${input}`;
  }
  const identifier = args[0];
  const flightplan = findFlightplan(identifier, ctx.flightplans);
  if (flightplan) {
    try {
      await ctx.deleteFlightplan(flightplan.aircraftId);
      return `${flightplan.aircraftId} ${flightplan.cid}REMOVE \nSTRIPS`;
    } catch (error) {
      console.error('Failed to delete flightplan:', error);
      const errorStr = String(error);
      if (errorStr.includes('Not your control')) {
        return `REJECT NOT YOUR CONTROL\n${flightplan.aircraftId}`;
      } else {
        return `REJECT DELETE FAILED\n${flightplan.aircraftId}`;
      }
    }
  } else {
    return `REJECT FLID NOT STORED\n${input}`;
  }
}

async function handleRM(input: string, args: string[], ctx: CommandContext): Promise<string> {
  if (args.length !== 1) {
    return `REJECT FORMAT\n${input}`;
  }
  const identifier = args[0];
  const fp = findFlightplan(identifier, ctx.flightplans);
  if (!fp) {
    return `REJECT 02 FLID NOT\nSTORED`;
  }

  // Strip any existing adapted block (+...+) from the route before re-matching
  const strippedRoute = stripAdaptedRoute(fp.route || '');
  const strippedFp = { ...fp, route: strippedRoute };

  // Use the active SA configuration's groups if one is set
  const activeGroups = ctx.activeConfiguration
    ? (ctx.atSpecialistConfigs.get(ctx.activeConfiguration)?.activeGroups ?? [])
    : [];

  const result = await findBestRouteForFlightplan(strippedFp, activeGroups);

  if (!result || !result.needsAmendment) {
    return `ACCEPT RM ${fp.aircraftId}\nNO ROUTE CHANGE`;
  }

  try {
    // Proposals/Tentative get the marked route (+...+) stored in vNAS so strips show it;
    // Active flights get the clean route.
    const routeToAmend = fp.status === 'Active' ? result.newRoute : result.stripRoute;
    const dto = buildAmendDto(fp, routeToAmend);
    await ctx.amendFlightplan(dto);
    return `ACCEPT RM ${fp.aircraftId}\n${result.routeId}`;
  } catch (error) {
    console.error('RM: amendment failed', error);
    return `REJECT RM AMENDMENT FAILED\n${fp.aircraftId}`;
  }
}

function handleSA(input: string, args: string[], ctx: CommandContext): string {
  if (args.length === 0) {
    return `REJECT FORMAT\n${input}`;
  }
  const name = args[0];
  const config = ctx.atSpecialistConfigs.get(name);
  if (!config) {
    return `REJECT SA UNKNOWN CONFIG\n${name}`;
  }
  ctx.setActiveConfiguration(name);
  const parts: string[] = [];
  if (config.activeGroups.length > 0) parts.push(`GROUPS: ${config.activeGroups.join(' ')}`);
  if (config.activeRoutes.length > 0) parts.push(`ROUTES: ${config.activeRoutes.join(' ')}`);
  return `ACCEPT SA ${name}\n${parts.join('  ')}`;
}

export async function parseCommand(input: string, ctx: CommandContext): Promise<string> {
  const [command, ...args] = input.trim().split(/\s+/).map(s => s.toUpperCase());

  switch (command) {
    case 'FP':
      return handleFP(input, ctx);
    case 'AM':
      return handleAM(input, ctx);
    case 'GI':
      return handleGI(input);
    case 'WR':
      return handleWR(input, args);
    case 'SR':
      return handleSR(input, args, ctx);
    case 'FR':
      return handleFR(input, args, ctx);
    case 'RS':
      return handleRS(input, args, ctx);
    case 'RM':
      return handleRM(input, args, ctx);
    case 'SA':
      return handleSA(input, args, ctx);
    default:
      // Send to ERAM hub for all other commands
      return ctx.sendCommand(input);
  }
}
