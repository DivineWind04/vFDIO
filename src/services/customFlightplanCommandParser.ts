import type { ApiFlightplan } from '../types/apiTypes/apiFlightplan';import type { ApiFlightplan } from '../types/apiTypes/apiFlightplan';

import { CustomFlightplanService } from './customFlightplanService';import { CustomFlightplanService } from './customFlightplanService';



export interface CommandResult {export interface CommandResult {

  output: string;  output: string;

  success: boolean;  success: boolean;

  data?: any;  data?: any;

}}



/**/**

 * Parser for custom flightplan commands * Parser for custom flightplan commands

 * Simplified to only handle FR (Flight Readout) command * Simplified to only handle FR (Flight Readout) command

 */ */

export class CustomFlightplanCommandParser {export class CustomFlightplanCommandParser {

  private flightplanService: CustomFlightplanService;  private flightplanService: CustomFlightplanService;



  constructor(flightplansMap: Map<string, ApiFlightplan>) {  constructor(flightplansMap: Map<string, ApiFlightplan>) {

    this.flightplanService = new CustomFlightplanService(flightplansMap);    this.flightplanService = new CustomFlightplanService(flightplansMap);

  }  }



  /**  /**

   * Update flightplan data   * Update flightplan data

   */   */

  updateFlightplans(flightplansMap: Map<string, ApiFlightplan>) {  updateFlightplans(flightplansMap: Map<string, ApiFlightplan>) {

    this.flightplanService = new CustomFlightplanService(flightplansMap);    this.flightplanService = new CustomFlightplanService(flightplansMap);

  }  }



  /**  /**

   * Execute a command and return the result   * Execute a command and return the result

   */   */

  executeCommand(commandLine: string): CommandResult {  executeCommand(commandLine: string): CommandResult {

    const parts = commandLine.trim().split(/\s+/);    const parts = commandLine.trim().split(/\s+/);

    const command = parts[0].toUpperCase();    const command = parts[0].toUpperCase();



    try {    try {

      switch (command) {      switch (command) {

        case 'FR':        case 'FR':

          return this.handleFlightReadoutCommand(parts.slice(1));          return this.handleFlightReadoutCommand(parts.slice(1));

                

        default:        default:

          return {          return {

            output: `Unknown command: ${command}. Only 'FR <aircraft_id>' is supported.`,            output: `Unknown command: ${command}. Only 'FR <aircraft_id>' is supported.`,

            success: false            success: false

          };          };

      }      }

    } catch (error) {    } catch (error) {

      return {      return {

        output: `Error executing command: ${error}`,        output: `Error executing command: ${error}`,

        success: false        success: false

      };      };

    }    }

  }  }



  /**  /**

   * Handle FR (Flight Readout) command - ERAM style flightplan readout   * Handle FR (Flight Readout) command - ERAM style flightplan readout

   * Usage: FR <aircraft_id>   * Usage: FR <aircraft_id>

   */   */

  private handleFlightReadoutCommand(args: string[]): CommandResult {  private handleFlightReadoutCommand(args: string[]): CommandResult {

    if (args.length === 0) {    if (args.length === 0) {

      return {      return {

        output: 'Usage: FR <aircraft_id>',        output: 'Usage: FR <aircraft_id>',

        success: false        success: false

      };      };

    }    }



    const aircraftId = args[0].toUpperCase();    const aircraftId = args[0].toUpperCase();

    const allFlightplans = this.flightplanService.getAllFlightplans();    const allFlightplans = this.flightplanService.getAllFlightplans();

    const flightplan = this.flightplanService.getFlightplanById(aircraftId);    const flightplan = this.flightplanService.getFlightplanById(aircraftId);



    if (!flightplan) {    if (!flightplan) {

      // More helpful error message for debugging      // More helpful error message for debugging

      const similarIds = allFlightplans      const similarIds = allFlightplans

        .filter(fp => fp.aircraftId.toUpperCase().includes(aircraftId))        .filter(fp => fp.aircraftId.toUpperCase().includes(aircraftId))

        .map(fp => fp.aircraftId)        .map(fp => fp.aircraftId)

        .slice(0, 3);        .slice(0, 3);

            

      if (similarIds.length > 0) {      if (similarIds.length > 0) {

        return {        return {

          output: `REJECT - FLID NOT STORED\nSimilar IDs found: ${similarIds.join(', ')}\nTotal flightplans: ${allFlightplans.length}`,          output: `REJECT - FLID NOT STORED\\nSimilar IDs found: ${similarIds.join(', ')}\\nTotal flightplans: ${allFlightplans.length}`,

          success: false          success: false

        };        };

      }      }

            

      return {      return {

        output: `REJECT - FLID NOT STORED\nTotal flightplans: ${allFlightplans.length}`,        output: `REJECT - FLID NOT STORED\\nTotal flightplans: ${allFlightplans.length}`,

        success: false        success: false

      };      };

    }    }



    // Check for duplicate ACIDs (simplified - in real ERAM this would check CID combinations)    // Check for duplicate ACIDs (simplified - in real ERAM this would check CID combinations)

    const duplicates = this.flightplanService.getAllFlightplans().filter(fp =>     const duplicates = this.flightplanService.getAllFlightplans().filter(fp => 

      fp.aircraftId.toUpperCase() === aircraftId      fp.aircraftId.toUpperCase() === aircraftId

    );    );



    if (duplicates.length > 1) {    if (duplicates.length > 1) {

      // Format duplicate list with CID, departure, and ETD      // Format duplicate list with CID, departure, and ETD

      const duplicateList = duplicates.map(fp => {      const duplicateList = duplicates.map(fp => {

        const etd = new Date(fp.estimatedDepartureTime * 1000);        const etd = new Date(fp.estimatedDepartureTime * 1000);

        const etdFormatted = etd.toISOString().substring(11, 16).replace(':', ''); // HHMM format        const etdFormatted = etd.toISOString().substring(11, 16).replace(':', ''); // HHMM format

        return `${fp.cid} ${fp.departure} ${etdFormatted}`;        return `${fp.cid} ${fp.departure} ${etdFormatted}`;

      }).join('\n');      }).join('\\n');



      return {      return {

        output: `REJECT - FLID DUPLICATION\n\n${duplicateList}`,        output: `REJECT - FLID DUPLICATION\\n\\n${duplicateList}`,

        success: false        success: false

      };      };

    }    }



    // Format the ERAM-style flight readout    // Format the ERAM-style flight readout

    const readout = this.formatERAMFlightReadout(flightplan);    const readout = this.formatERAMFlightReadout(flightplan);



    return {    return {

      output: readout,      output: readout,

      success: true,      success: true,

      data: flightplan      data: flightplan

    };    };

  }  }



  /**  /**

   * Format flightplan in ERAM FR command style   * Format flightplan in ERAM FR command style

   */   */

  private formatERAMFlightReadout(fp: ApiFlightplan): string {  private formatERAMFlightReadout(fp: ApiFlightplan): string {

    // Format estimated departure time    // Format estimated departure time

    const etd = new Date(fp.estimatedDepartureTime * 1000);    const etd = new Date(fp.estimatedDepartureTime * 1000);

    const etdDate = etd.toISOString().substring(5, 10).replace('-', ''); // MMDD format    const etdDate = etd.toISOString().substring(5, 10).replace('-', ''); // MMDD format

    const etdTime = etd.toISOString().substring(11, 16).replace(':', ''); // HHMM format    const etdTime = etd.toISOString().substring(11, 16).replace(':', ''); // HHMM format



    // Format actual departure time if available    // Format actual departure time if available

    let atd = '';    let atd = '';

    if (fp.actualDepartureTime > 0) {    if (fp.actualDepartureTime > 0) {

      const atdDate = new Date(fp.actualDepartureTime * 1000);      const atdDate = new Date(fp.actualDepartureTime * 1000);

      atd = atdDate.toISOString().substring(11, 16).replace(':', ''); // HHMM format      atd = atdDate.toISOString().substring(11, 16).replace(':', ''); // HHMM format

    }    }



    // Format beacon code    // Format beacon code

    const beacon = fp.assignedBeaconCode ? fp.assignedBeaconCode.toString().padStart(4, '0') : '';    const beacon = fp.assignedBeaconCode ? fp.assignedBeaconCode.toString().padStart(4, '0') : '';



    // Format fuel time    // Format fuel time

    const fuelTime = `${fp.fuelHours.toString().padStart(2, '0')}${fp.fuelMinutes.toString().padStart(2, '0')}`;    const fuelTime = `${fp.fuelHours.toString().padStart(2, '0')}${fp.fuelMinutes.toString().padStart(2, '0')}`;



    // Format enroute time    // Format enroute time

    const enrouteTime = `${fp.hoursEnroute.toString().padStart(2, '0')}${fp.minutesEnroute.toString().padStart(2, '0')}`;    const enrouteTime = `${fp.hoursEnroute.toString().padStart(2, '0')}${fp.minutesEnroute.toString().padStart(2, '0')}`;



    // Create the ERAM-style readout    // Create the ERAM-style readout

    const lines = [    const lines = [

      `${fp.aircraftId.padEnd(8)} ${fp.aircraftType.padEnd(4)} ${fp.departure.padEnd(4)} ${fp.destination.padEnd(4)} ${atd.padEnd(4)} ${fp.altitude.padEnd(6)} ${fp.speed.toString().padEnd(4)}`,      `${fp.aircraftId.padEnd(8)} ${fp.aircraftType.padEnd(4)} ${fp.departure.padEnd(4)} ${fp.destination.padEnd(4)} ${atd.padEnd(4)} ${fp.altitude.padEnd(6)} ${fp.speed.toString().padEnd(4)}`,

      `${fp.cid.padEnd(8)}`,      `${fp.cid.padEnd(8)}`,

      `A${fp.alternate.padEnd(4)}`,      `A${fp.alternate.padEnd(4)}`,

      `${fp.equipment.padEnd(10)}`,      `${fp.equipment.padEnd(10)}`,

      '',      '',

      `${fp.route}`,      `${fp.route}`,

      '',      '',

      `RMK/${fp.remarks || ''}`      `RMK/${fp.remarks || ''}`

    ];    ];



    // Add the formatted header similar to ERAM    // Add the formatted header similar to ERAM

    const header = `${fp.aircraftId} ${etdDate} ${etdTime} ${beacon} ${fuelTime} ${enrouteTime}`;    const header = `${fp.aircraftId} ${etdDate} ${etdTime} ${beacon} ${fuelTime} ${enrouteTime}`;

        

    return [header, '', ...lines].join('\n');    return [header, '', ...lines].join('\\n');

  }  }

}}
  private flightplanService: CustomFlightplanService;

  constructor(flightplansMap: Map<string, ApiFlightplan>) {
    this.flightplanService = new CustomFlightplanService(flightplansMap);
  }

  /**
   * Update the flightplan service with new data
   */
  updateFlightplans(flightplansMap: Map<string, ApiFlightplan>) {
    this.flightplanService = new CustomFlightplanService(flightplansMap);
  }

  /**
   * Parse and execute a custom command
   */
  executeCommand(commandString: string): CommandResult {
    const parts = commandString.trim().split(/\s+/);
    const command = parts[0]?.toUpperCase();

    try {
      switch (command) {
        case 'FR':
          return this.handleFlightReadoutCommand(parts.slice(1));
        
        default:
          return {
            output: `Unknown command: ${command}. Only 'FR <aircraft_id>' is supported.`,
            success: false
          };
      }
    } catch (error) {
      return {
        output: `Error executing command: ${error}`,
        success: false
      };
    }
  }

  /**
   * Debug command to show current flightplan data
   */
  private handleDebugCommand(): CommandResult {
    const allFlightplans = this.flightplanService.getAllFlightplans();
    
    if (allFlightplans.length === 0) {
      return {
        output: [
          'DEBUG: No flightplans in service',
          '',
          'Possible causes:',
          '1. Hub not subscribed to FlightPlans topic',
          '2. No active flightplans in the system',
          '3. Facility ID not set correctly',
          '4. Session not active',
          '',
          'Check browser console for subscription logs:',
          '- "Subscribing to FlightPlans for facility: [ID]"',
          '- "received flightplan: [data]"',
          '',
          'Try regular ERAM commands to see if any flightplans exist',
          'in the system that should be displayed.'
        ].join('\\n'),
        success: true
      };
    }

    const aircraftIds = allFlightplans.map(fp => fp.aircraftId).slice(0, 10);
    const output = [
      `DEBUG: Flightplan Service Status`,
      `Total flightplans: ${allFlightplans.length}`,
      `First 10 Aircraft IDs: ${aircraftIds.join(', ')}`,
      '',
      'Sample flightplan data:',
      allFlightplans[0] ? `${allFlightplans[0].aircraftId}: ${allFlightplans[0].departure} -> ${allFlightplans[0].destination}` : 'None',
      '',
      'Ready for FR commands with any of the above Aircraft IDs'
    ].join('\\n');

    return {
      output,
      success: true,
      data: allFlightplans
    };
  }

  /**
   * Handle FR (Flight Readout) command - ERAM style flightplan readout
   * Usage: FR <aircraft_id>
   */
  private handleFlightReadoutCommand(args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        output: 'REJECT - FLID NOT STORED',
        success: false
      };
    }

    const aircraftId = args[0].toUpperCase();
    
    // Debug: Check how many flightplans we have and list some IDs
    const allFlightplans = this.flightplanService.getAllFlightplans();
    console.log(`FR Debug: Looking for ${aircraftId}, have ${allFlightplans.length} flightplans`);
    console.log('Available Aircraft IDs:', allFlightplans.slice(0, 5).map(fp => fp.aircraftId));
    
    const flightplan = this.flightplanService.getFlightplanById(aircraftId);

    if (!flightplan) {
      // More helpful error message for debugging
      const similarIds = allFlightplans
        .filter(fp => fp.aircraftId.toUpperCase().includes(aircraftId))
        .map(fp => fp.aircraftId)
        .slice(0, 3);
      
      if (similarIds.length > 0) {
        return {
          output: `REJECT - FLID NOT STORED\\nSimilar IDs found: ${similarIds.join(', ')}\\nTotal flightplans: ${allFlightplans.length}`,
          success: false
        };
      }
      
      return {
        output: `REJECT - FLID NOT STORED\\nTotal flightplans: ${allFlightplans.length}`,
        success: false
      };
    }

    // Check for duplicate ACIDs (simplified - in real ERAM this would check CID combinations)
    const duplicates = this.flightplanService.getAllFlightplans().filter(fp => 
      fp.aircraftId.toUpperCase() === aircraftId
    );

    if (duplicates.length > 1) {
      // Format duplicate list with CID, departure, and ETD
      const duplicateList = duplicates.map(fp => {
        const etd = new Date(fp.estimatedDepartureTime * 1000);
        const etdFormatted = etd.toISOString().substring(11, 16).replace(':', ''); // HHMM format
        return `${fp.cid} ${fp.departure} ${etdFormatted}`;
      }).join('\\n');

      return {
        output: `REJECT - FLID DUPLICATION\\n\\n${duplicateList}`,
        success: false
      };
    }

    // Format the ERAM-style flight readout
    const readout = this.formatERAMFlightReadout(flightplan);

    return {
      output: readout,
      success: true,
      data: flightplan
    };
  }

  /**
   * Format flightplan in ERAM FR command style
   */
  private formatERAMFlightReadout(fp: ApiFlightplan): string {
    // Format estimated departure time
    const etd = new Date(fp.estimatedDepartureTime * 1000);
    const etdDate = etd.toISOString().substring(5, 10).replace('-', ''); // MMDD format
    const etdTime = etd.toISOString().substring(11, 16).replace(':', ''); // HHMM format

    // Format actual departure time if available
    let atd = '';
    if (fp.actualDepartureTime > 0) {
      const atdDate = new Date(fp.actualDepartureTime * 1000);
      atd = atdDate.toISOString().substring(11, 16).replace(':', ''); // HHMM format
    }

    // Format beacon code
    const beacon = fp.assignedBeaconCode ? fp.assignedBeaconCode.toString().padStart(4, '0') : '';

    // Format fuel time
    const fuelTime = `${fp.fuelHours.toString().padStart(2, '0')}${fp.fuelMinutes.toString().padStart(2, '0')}`;

    // Format enroute time
    const enrouteTime = `${fp.hoursEnroute.toString().padStart(2, '0')}${fp.minutesEnroute.toString().padStart(2, '0')}`;

    // Create the ERAM-style readout
    const lines = [
      `${fp.aircraftId.padEnd(8)} ${fp.aircraftType.padEnd(4)} ${fp.departure.padEnd(4)} ${fp.destination.padEnd(4)} ${atd.padEnd(4)} ${fp.altitude.padEnd(6)} ${fp.speed.toString().padEnd(4)}`,
      `${fp.cid.padEnd(8)}`,
      `A${fp.alternate.padEnd(4)}`,
      `${fp.equipment.padEnd(10)}`,
      '',
      `${fp.route}`,
      '',
      `RMK/${fp.remarks || ''}`
    ];

    // Add the formatted header similar to ERAM
    const header = `${fp.aircraftId} ${etdDate} ${etdTime} ${beacon} ${fuelTime} ${enrouteTime}`;
    
    return [header, '', ...lines].join('\\n');
  }
}

    const aircraftId = args[0].toUpperCase();
    const flightplan = this.flightplanService.getFlightplanById(aircraftId);

    if (!flightplan) {
      return {
        output: `No flightplan found for aircraft: ${aircraftId}`,
        success: false
      };
    }

    return {
      output: this.flightplanService.formatFlightplanForDisplay(flightplan),
      success: true,
      data: flightplan
    };
  }

  /**
   * Handle multiple flightplans command with filters
   * Usage: FPS [status=<status>] [dep=<airport>] [dest=<airport>] [alt=<altitude>]
   */
  private handleFlightplansCommand(args: string[]): CommandResult {
    const filter: FlightplanFilter = {};

    // Parse key=value arguments
    for (const arg of args) {
      const [key, value] = arg.split('=');
      if (!key || !value) continue;

      switch (key.toLowerCase()) {
        case 'status':
          if (['Active', 'Proposed', 'Tentative'].includes(value)) {
            filter.status = value as ApiFlightplan['status'];
          }
          break;
        case 'dep':
        case 'departure':
          filter.departure = value;
          break;
        case 'dest':
        case 'destination':
          filter.destination = value;
          break;
        case 'alt':
        case 'altitude':
          filter.altitude = value;
          break;
        case 'route':
          filter.route = value;
          break;
        case 'acid':
        case 'aircraftid':
          filter.aircraftId = value;
          break;
      }
    }

    const result = this.flightplanService.searchFlightplans(filter);

    if (result.flightplans.length === 0) {
      return {
        output: 'No flightplans match the specified criteria.',
        success: true,
        data: result
      };
    }

    const output = [
      `Found ${result.filteredCount} of ${result.totalCount} flightplans:`,
      '',
      this.flightplanService.formatFlightplansTable(result.flightplans)
    ].join('\\n');

    return {
      output,
      success: true,
      data: result
    };
  }

  /**
   * Handle flightplan list command with simple filters
   * Usage: FPL [ALL|ACTIVE|PROPOSED|TENTATIVE]
   */
  private handleFlightplanListCommand(args: string[]): CommandResult {
    let flightplans: ApiFlightplan[];
    let title = 'All Flightplans';

    if (args.length > 0) {
      const filter = args[0].toUpperCase();
      switch (filter) {
        case 'ACTIVE':
          flightplans = this.flightplanService.getFlightplansByStatus('Active');
          title = 'Active Flightplans';
          break;
        case 'PROPOSED':
          flightplans = this.flightplanService.getFlightplansByStatus('Proposed');
          title = 'Proposed Flightplans';
          break;
        case 'TENTATIVE':
          flightplans = this.flightplanService.getFlightplansByStatus('Tentative');
          title = 'Tentative Flightplans';
          break;
        case 'ALL':
        default:
          flightplans = this.flightplanService.getAllFlightplans();
          break;
      }
    } else {
      flightplans = this.flightplanService.getAllFlightplans();
    }

    if (flightplans.length === 0) {
      return {
        output: `No ${title.toLowerCase()} found.`,
        success: true,
        data: flightplans
      };
    }

    const output = [
      `${title} (${flightplans.length}):`,
      '',
      this.flightplanService.formatFlightplansTable(flightplans)
    ].join('\\n');

    return {
      output,
      success: true,
      data: flightplans
    };
  }

  /**
   * Handle flightplan find command with various search criteria
   * Usage: FPF <criteria> <value>
   * Criteria: DEP, DEST, WAYPOINT, ALT, TYPE
   */
  private handleFlightplanFindCommand(args: string[]): CommandResult {
    if (args.length < 2) {
      return {
        output: 'Usage: FPF <criteria> <value>\\nCriteria: DEP, DEST, WAYPOINT, ALT, TYPE\\nExample: FPF DEP KJFK',
        success: false
      };
    }

    const criteria = args[0].toUpperCase();
    const value = args[1].toUpperCase();
    let flightplans: ApiFlightplan[];
    let description = '';

    switch (criteria) {
      case 'DEP':
      case 'DEPARTURE':
        flightplans = this.flightplanService.getFlightplansByDeparture(value);
        description = `departing from ${value}`;
        break;
      
      case 'DEST':
      case 'DESTINATION':
        flightplans = this.flightplanService.getFlightplansByDestination(value);
        description = `arriving at ${value}`;
        break;
      
      case 'WAYPOINT':
      case 'WPT':
        flightplans = this.flightplanService.getFlightplansByWaypoint(value);
        description = `routing via ${value}`;
        break;
      
      case 'ALT':
      case 'ALTITUDE':
        flightplans = this.flightplanService.getFlightplansByAltitude(value);
        description = `at altitude ${value}`;
        break;
      
      case 'TYPE':
      case 'AIRCRAFT':
        flightplans = this.flightplanService.getAllFlightplans().filter(fp => 
          fp.aircraftType.toUpperCase().includes(value)
        );
        description = `aircraft type containing ${value}`;
        break;
      
      default:
        return {
          output: `Unknown search criteria: ${criteria}\\nValid criteria: DEP, DEST, WAYPOINT, ALT, TYPE`,
          success: false
        };
    }

    if (flightplans.length === 0) {
      return {
        output: `No flightplans found ${description}.`,
        success: true,
        data: flightplans
      };
    }

    const output = [
      `Found ${flightplans.length} flightplans ${description}:`,
      '',
      this.flightplanService.formatFlightplansTable(flightplans)
    ].join('\\n');

    return {
      output,
      success: true,
      data: flightplans
    };
  }

  /**
   * Handle flightplan statistics command
   */
  private handleFlightplanStatsCommand(): CommandResult {
    const stats = this.flightplanService.getFlightplanStatistics();
    
    const equipmentList = Array.from(stats.byEquipmentType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // Top 5
      .map(([type, count]) => `  ${type}: ${count}`)
      .join('\\n');

    const altitudeList = Array.from(stats.altitudeDistribution.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Top 10
      .map(([alt, count]) => `  ${alt}: ${count}`)
      .join('\\n');

    const output = [
      'FLIGHTPLAN STATISTICS',
      '=====================',
      `Total Flightplans: ${stats.total}`,
      '',
      'Status Distribution:',
      `  Active: ${stats.byStatus.Active}`,
      `  Proposed: ${stats.byStatus.Proposed}`,
      `  Tentative: ${stats.byStatus.Tentative}`,
      '',
      'Top Aircraft Types:',
      equipmentList || '  None',
      '',
      'Average Speed: ' + stats.averageSpeed + ' knots',
      '',
      'Top Altitudes:',
      altitudeList || '  None'
    ].join('\\n');

    return {
      output,
      success: true,
      data: stats
    };
  }

  /**
   * Handle help command
   */
  private handleHelpCommand(): CommandResult {
    const helpText = [
      'CUSTOM FLIGHTPLAN COMMANDS',
      '==========================',
      '',
      'FR <aircraft_id>           - ERAM-style flight readout for specific aircraft',
      'FPDEBUG                    - Debug current flightplan data and status',
      'FPMOCK                     - Create mock test data (DAL123, UAL456) for testing',
      '',
      'FP <aircraft_id>           - Display detailed flightplan for specific aircraft',
      'FPS [filters]              - Display flightplans with optional filters',
      '  Filters: status=<value> dep=<airport> dest=<airport> alt=<altitude> route=<waypoint>',
      '  Example: FPS status=Active dep=KJFK',
      '',
      'FPL [status]               - List flightplans by status (ALL|ACTIVE|PROPOSED|TENTATIVE)',
      'FPF <criteria> <value>     - Find flightplans by criteria',
      '  Criteria: DEP, DEST, WAYPOINT, ALT, TYPE',
      '  Example: FPF DEP KJFK',
      '',
      'FPSTATS                    - Display flightplan statistics',
      'FPHELP                     - Display this help message',
      '',
      'Examples:',
      '  FPMOCK                   - Create test data for demonstration',
      '  FR DAL123                - ERAM flight readout for DAL123 (after FPMOCK)',
      '  FP UAL123                - Show details for UAL123',
      '  FPS dep=KJFK dest=KLAX   - Find flights from JFK to LAX',
      '  FPL ACTIVE               - List all active flightplans',
      '  FPF WAYPOINT HOFFA       - Find flights routing via HOFFA',
      '  FPSTATS                  - Show statistics summary'
    ].join('\\n');

    return {
      output: helpText,
      success: true
    };
  }
}