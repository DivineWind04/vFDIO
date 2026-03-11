# Custom Flightplan Commands

This system provides direct access to flightplan DTO objects with custom commands, allowing you to view and render flightplan data without relying on predefined hub commands.

## Available Commands

### Primary Command

- **`FR <aircraft_id>`** - ERAM-style flight readout for specific aircraft
  - Example: `FR UAL123`
  - Shows formatted flight data like traditional ERAM systems
  - Returns "REJECT - FLID NOT STORED" if aircraft not found
  - Returns "REJECT - FLID DUPLICATION" with CID list if multiple matches

### Basic Commands

- **`FP <aircraft_id>`** - Display detailed flightplan for a specific aircraft
  - Example: `FP UAL123`

- **`FPHELP`** - Display help message with all available commands

### List Commands

- **`FPL [status]`** - List flightplans by status
  - `FPL` or `FPL ALL` - Show all flightplans
  - `FPL ACTIVE` - Show only active flightplans
  - `FPL PROPOSED` - Show only proposed flightplans
  - `FPL TENTATIVE` - Show only tentative flightplans

### Search Commands

- **`FPS [filters]`** - Search flightplans with multiple filters
  - Filters: `status=<value>`, `dep=<airport>`, `dest=<airport>`, `alt=<altitude>`, `route=<waypoint>`, `acid=<aircraft_id>`
  - Example: `FPS status=Active dep=KJFK`
  - Example: `FPS dep=KJFK dest=KLAX`

- **`FPF <criteria> <value>`** - Find flightplans by specific criteria
  - Criteria: `DEP`, `DEST`, `WAYPOINT`, `ALT`, `TYPE`
  - Example: `FPF DEP KJFK` - Find flights departing from JFK
  - Example: `FPF WAYPOINT HOFFA` - Find flights routing via HOFFA waypoint
  - Example: `FPF TYPE B738` - Find flights using Boeing 737-800

### Statistics Command

- **`FPSTATS`** - Display comprehensive flightplan statistics
  - Shows total counts by status
  - Top aircraft types
  - Average speed
  - Altitude distribution

## Usage Examples

```
FR UAL123                    # ERAM-style flight readout for UAL123
FP UAL123                    # Show detailed info for UAL123
FPS dep=KJFK dest=KLAX      # Find all flights from JFK to LAX
FPL ACTIVE                  # List all active flightplans
FPF WAYPOINT HOFFA          # Find flights via HOFFA waypoint
FPF DEP KORD                # Find all departures from Chicago O'Hare
FPSTATS                     # Show statistics summary
```

## Implementation Details

### Files
- `src/services/customFlightplanService.ts` - Core flightplan operations
- `src/services/customFlightplanCommandParser.ts` - Command parsing logic
- `src/redux/slices/customFlightplanSlice.ts` - State management
