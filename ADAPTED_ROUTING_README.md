# Adapted Routing Configuration Guide

## Overview

This module provides adapted departure/arrival route analysis for vFDIO, ported from the C# AuroraLabelItemsPlugin. It reads XML adaptation files and implements FAA adapted routing logic.

## Setup

### 1. Serving XML Files

Since vFDIO runs in the browser, the XML adaptation files need to be served via HTTP. There are several options:

#### Option A: Local Development Server

Add a static file endpoint to your development setup. Create a simple Express server or use a static file server:

```bash
# Using npx serve (one-liner)
npx serve H:/ATC\ tools/NAS/adaptations -p 3001 --cors
```

Then configure the base path in the app:
```typescript
import { setXmlBasePath } from './redux/slices/adaptedRoutingSlice';
dispatch(setXmlBasePath('http://localhost:3001'));
```

#### Option B: Copy Files to Public Folder

Copy the XML files to the `public/adaptations/` folder:
```
public/
  adaptations/
    ZOA/
      ADAR.xml
      ADR.xml
      AAR.xml
      ADR_XLine.xml
      AAR_XLine.xml
```

Then use the default path `/api/adaptations` or configure to `/adaptations`.

#### Option C: Backend API Proxy

Add endpoints to your API backend that serve the XML files.

### 2. Initialize the Service

In your app initialization (e.g., App.tsx):

```typescript
import { useInitializeAdaptedRouting } from './hooks/useAdaptedRouting';

function App() {
  const { initialize, isInitialized, error } = useInitializeAdaptedRouting();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  // ... rest of app
}
```

### 3. Automatic Route Processing

The system automatically processes all incoming flightplans and amends them with the best adapted route. Use the `useAutoAdaptedRouting` hook:

```typescript
import { useAutoAdaptedRouting } from './hooks/useAutoAdaptedRouting';
import { useContext } from 'react';
import { HubContext } from './contexts/HubContext';

function App() {
  const hubContext = useContext(HubContext);
  
  // Get flightplans from hub context
  const { flightplans } = hubContext;
  
  // Enable automatic processing
  const { 
    isProcessing,
    stats,
    error,
    processAll,
    reset
  } = useAutoAdaptedRouting(flightplans, {
    enabled: true,          // Enable auto-processing
    processOnChange: true,  // Process new flightplans automatically
    debounceMs: 1000,       // Debounce processing
    routeGroup: 'ZOA'       // ARTCC route group
  });
  
  return (
    <div>
      {isProcessing && <span>Processing routes...</span>}
      {stats && <span>Amended: {stats.amended} / Processed: {stats.totalProcessed}</span>}
      <button onClick={processAll}>Process All</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}
```

The automatic processing:
- Runs when new flightplans arrive (debounced)
- Finds the best route using priority: ADAR → ADR → AAR
- Automatically amends flightplans via SignalR hub
- Tracks processed flightplans to avoid re-processing

### 4. Display Component (Optional)

For viewing available routes without automatic amendment:

```typescript
import { PreferredRouteDisplay } from './components/PreferredRouteDisplay';

function FlightplanDetail({ flightplan }) {
  return (
    <PreferredRouteDisplay 
      flightplan={flightplan}
    />
  );
}
```

### 5. Individual Route Hooks

For custom display logic:

```typescript
import { useAar, useAdr, useAdar } from './hooks/useAdaptedRouting';

function RouteAnalysis({ flightplan }) {
  const aar = useAar(flightplan);
  const adr = useAdr(flightplan);
  const adar = useAdar(flightplan);
  
  return (
    <div>
      <h3>ADAR Routes: {adar.length}</h3>
      <h3>ADR Routes: {adr.length}</h3>
      <h3>AAR Routes: {aar.length}</h3>
    </div>
  );
}
```

### 6. Preview Route Without Amending

```typescript
import { useAdaptedRoutePreview } from './hooks/useAutoAdaptedRouting';

function RoutePreview({ flightplan }) {
  const preview = useAdaptedRoutePreview(flightplan);
  
  if (!preview?.needsAmendment) {
    return <span>No amendment needed</span>;
  }
  
  return (
    <div>
      <p>Current: {flightplan.route}</p>
      <p>Proposed: {preview.newRoute}</p>
      <p>Type: {preview.routeType}</p>
    </div>
  );
}
```

The route concatenation logic:
- **ADAR**: Replaces the entire route with the adapted route
- **ADR**: Inserts the departure procedure at the start, up to the triggered fix
- **AAR**: Appends the arrival procedure from the triggered fix onwards
- Routes are marked with `+...+` markers in the concatenated output

## XML File Format

The parser supports the NAS adaptation XML format. Expected structure:

### ADAR.xml (Adapted Departure Arrival Routes)
```xml
<Routes>
  <ADAR>
    <ADAR_ID>ZOA_ADAR_001</ADAR_ID>
    <RouteGroups>ZOA</RouteGroups>
    <Order>1</Order>
    <LowerAltitude>0</LowerAltitude>
    <UpperAltitude>60000</UpperAltitude>
    <AutoRouteAlphas>SFO.SFOXX1.PORTE.Q90.BOILE</AutoRouteAlphas>
    <DepAirports>KSFO KOAK</DepAirports>
    <ArrAirports>KLAX KSAN</ArrAirports>
    <ACClassCriteria>ZOAJ ZOAN</ACClassCriteria>
    <IERRCriteria></IERRCriteria>
    <RouteFixes>PORTE BOILE</RouteFixes>
  </ADAR>
</Routes>
```

### ADR.xml (Adapted Departure Routes)
```xml
<Routes>
  <ADR>
    <ADRID>ZOA_ADR_001</ADRID>
    <RouteGroups>ZOA</RouteGroups>
    <TransitionFixes>PORTE BRIXX</TransitionFixes>
    <Airports>KSFO KOAK</Airports>
    <!-- ... similar fields -->
  </ADR>
</Routes>
```

### AAR.xml (Adapted Arrival Routes)
```xml
<Routes>
  <AAR>
    <AARID>ZOA_AAR_001</AARID>
    <RouteGroups>ZOA</RouteGroups>
    <TransitionFixes>ARCHI FAITH</TransitionFixes>
    <Airports>KLAX KSAN</Airports>
    <!-- ... similar fields -->
  </AAR>
</Routes>
```

## ARTCC Configuration

To change the ARTCC (and thus which adaptation files are loaded):

```typescript
import { setArtccId } from './redux/slices/adaptedRoutingSlice';
dispatch(setArtccId('ZLA')); // Will load from {basePath}/ZLA/
```

## Route Groups

Route groups filter which routes are considered. Configure active groups:

```typescript
import { setActiveRouteGroups } from './redux/slices/adaptedRoutingSlice';
dispatch(setActiveRouteGroups(['ZOA', 'ZOA_EAST']));
```

## Future: MongoDB Migration

When ready to migrate to MongoDB, replace the XML loading in `adaptedRoutingXmlParser.ts` with MongoDB queries. The service interface (`AdaptedRoutingsService`) will remain the same.

```typescript
// Future MongoDB implementation example
async function loadFromMongoDB(artccId: string): Promise<AdaptedRoutingData> {
  const [adar, adr, aar] = await Promise.all([
    db.collection('adar').find({ artccId }).toArray(),
    db.collection('adr').find({ artccId }).toArray(),
    db.collection('aar').find({ artccId }).toArray(),
  ]);
  
  return { adaptedDepartureArrivals: adar, adaptedDepartures: adr, ... };
}
```

## Differences from C# Implementation

1. **File Access**: Browser cannot directly access filesystem; requires HTTP serving
2. **Route Parsing**: Full route segment parsing not implemented; would need a route parser service
3. **XLine Coordinate Calculations**: Simplified; full great circle intersection not implemented
4. **Async Operations**: All operations are async/Promise-based
5. **State Management**: Uses Redux for state/caching instead of static class variables

## API Compatibility

The output types (`ApiAdaptedDepartureRoute`, `ApiAdaptedArrivalRoute`, `ApiAdaptedDepartureArrivalRoute`) match EDST's API format for compatibility with shared components.
