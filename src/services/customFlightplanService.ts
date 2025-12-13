import type { ApiFlightplan, CreateOrAmendFlightplanDto } from '../types/apiTypes/apiFlightplan';

export interface FlightplanFilter {
  aircraftId?: string;
  callsign?: string;
  departure?: string;
  destination?: string;
  status?: ApiFlightplan['status'];
  altitude?: string;
  route?: string;
}

export interface FlightplanSearchResult {
  flightplans: ApiFlightplan[];
  totalCount: number;
  filteredCount: number;
}

export class CustomFlightplanService {
  private flightplans: Map<string, ApiFlightplan>;

  constructor(flightplansMap: Map<string, ApiFlightplan>) {
    this.flightplans = flightplansMap;
  }

  /**
   * Get all flightplans as an array
   */
  getAllFlightplans(): ApiFlightplan[] {
    return Array.from(this.flightplans.values());
  }

  /**
   * Get a specific flightplan by aircraft ID
   */
  getFlightplanById(aircraftId: string): ApiFlightplan | undefined {
    return this.flightplans.get(aircraftId);
  }

  /**
   * Search and filter flightplans based on criteria
   */
  searchFlightplans(filter: FlightplanFilter): FlightplanSearchResult {
    const allFlightplans = this.getAllFlightplans();
    
    let filteredFlightplans = allFlightplans;

    if (filter.aircraftId) {
      const aircraftIdUpper = filter.aircraftId.toUpperCase();
      filteredFlightplans = filteredFlightplans.filter(fp => 
        fp.aircraftId.toUpperCase().includes(aircraftIdUpper)
      );
    }

    if (filter.departure) {
      const depUpper = filter.departure.toUpperCase();
      filteredFlightplans = filteredFlightplans.filter(fp => 
        fp.departure.toUpperCase().includes(depUpper)
      );
    }

    if (filter.destination) {
      const destUpper = filter.destination.toUpperCase();
      filteredFlightplans = filteredFlightplans.filter(fp => 
        fp.destination.toUpperCase().includes(destUpper)
      );
    }

    if (filter.status) {
      filteredFlightplans = filteredFlightplans.filter(fp => 
        fp.status === filter.status
      );
    }

    if (filter.altitude) {
      filteredFlightplans = filteredFlightplans.filter(fp => 
        fp.altitude.includes(filter.altitude!)
      );
    }

    if (filter.route) {
      const routeUpper = filter.route.toUpperCase();
      filteredFlightplans = filteredFlightplans.filter(fp => 
        fp.route.toUpperCase().includes(routeUpper)
      );
    }

    return {
      flightplans: filteredFlightplans,
      totalCount: allFlightplans.length,
      filteredCount: filteredFlightplans.length
    };
  }

  /**
   * Get flightplans by status
   */
  getFlightplansByStatus(status: ApiFlightplan['status']): ApiFlightplan[] {
    return this.getAllFlightplans().filter(fp => fp.status === status);
  }

  /**
   * Get flightplans by departure airport
   */
  getFlightplansByDeparture(departure: string): ApiFlightplan[] {
    const depUpper = departure.toUpperCase();
    return this.getAllFlightplans().filter(fp => 
      fp.departure.toUpperCase() === depUpper
    );
  }

  /**
   * Get flightplans by destination airport
   */
  getFlightplansByDestination(destination: string): ApiFlightplan[] {
    const destUpper = destination.toUpperCase();
    return this.getAllFlightplans().filter(fp => 
      fp.destination.toUpperCase() === destUpper
    );
  }

  /**
   * Get flightplans by route containing a specific waypoint
   */
  getFlightplansByWaypoint(waypoint: string): ApiFlightplan[] {
    const waypointUpper = waypoint.toUpperCase();
    return this.getAllFlightplans().filter(fp => 
      fp.route.toUpperCase().includes(waypointUpper)
    );
  }

  /**
   * Get flightplans by altitude
   */
  getFlightplansByAltitude(altitude: string): ApiFlightplan[] {
    return this.getAllFlightplans().filter(fp => fp.altitude === altitude);
  }

  /**
   * Get statistics about current flightplans
   */
  getFlightplanStatistics() {
    const allFlightplans = this.getAllFlightplans();
    const stats = {
      total: allFlightplans.length,
      byStatus: {
        Active: 0,
        Proposed: 0,
        Tentative: 0
      },
      byEquipmentType: new Map<string, number>(),
      averageSpeed: 0,
      altitudeDistribution: new Map<string, number>()
    };

    let totalSpeed = 0;

    allFlightplans.forEach(fp => {
      // Count by status
      stats.byStatus[fp.status]++;

      // Count by aircraft type
      const currentCount = stats.byEquipmentType.get(fp.aircraftType) || 0;
      stats.byEquipmentType.set(fp.aircraftType, currentCount + 1);

      // Sum speeds for average
      totalSpeed += fp.speed;

      // Count by altitude
      const altCount = stats.altitudeDistribution.get(fp.altitude) || 0;
      stats.altitudeDistribution.set(fp.altitude, altCount + 1);
    });

    stats.averageSpeed = allFlightplans.length > 0 ? Math.round(totalSpeed / allFlightplans.length) : 0;

    return stats;
  }

  /**
   * Format a flightplan for display
   */
  formatFlightplanForDisplay(flightplan: ApiFlightplan): string {
    const lines = [
      `Aircraft ID: ${flightplan.aircraftId}`,
      `CID: ${flightplan.cid}`,
      `Status: ${flightplan.status}`,
      `Equipment: ${flightplan.equipment} (${flightplan.aircraftType})`,
      `Speed: ${flightplan.speed} knots`,
      `Altitude: ${flightplan.altitude}`,
      `Route: ${flightplan.departure} -> ${flightplan.destination}`,
      `Full Route: ${flightplan.route}`,
      `Alternate: ${flightplan.alternate}`,
      `Beacon Code: ${flightplan.assignedBeaconCode || 'Not Assigned'}`,
      `Pilot CID: ${flightplan.pilotCid}`,
      `ETD: ${new Date(flightplan.estimatedDepartureTime * 1000).toISOString()}`,
      `Fuel: ${flightplan.fuelHours}:${flightplan.fuelMinutes.toString().padStart(2, '0')}`,
      `Enroute Time: ${flightplan.hoursEnroute}:${flightplan.minutesEnroute.toString().padStart(2, '0')}`,
      `Remarks: ${flightplan.remarks || 'None'}`
    ];

    return lines.join('\n');
  }

  /**
   * Format multiple flightplans in a table-like format
   */
  formatFlightplansTable(flightplans: ApiFlightplan[]): string {
    if (flightplans.length === 0) {
      return 'No flightplans found.';
    }

    const header = 'ACID    TYPE  DEP  DEST ALT    SPEED STATUS    PILOT';
    const separator = '-'.repeat(header.length);
    
    const rows = flightplans.map(fp => {
      const acid = fp.aircraftId.padEnd(8);
      const type = fp.aircraftType.substring(0, 4).padEnd(5);
      const dep = fp.departure.padEnd(4);
      const dest = fp.destination.padEnd(4);
      const alt = fp.altitude.padEnd(6);
      const speed = fp.speed.toString().padEnd(5);
      const status = fp.status.substring(0, 8).padEnd(9);
      const pilot = fp.pilotCid.substring(0, 7);
      
      return `${acid} ${type} ${dep} ${dest} ${alt} ${speed} ${status} ${pilot}`;
    });

    return [header, separator, ...rows].join('\n');
  }
}