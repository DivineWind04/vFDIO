import React, { useEffect, useState, useRef } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from './redux/store';
import { HubContextProvider } from './contexts/HubContext';
import LoginProvider from './login/Login';
import { useRootDispatch, useRootSelector } from './redux/hooks';
import { getVnasConfig, vatsimTokenSelector, sessionSelector, logoutThunk, hubConnectedSelector } from './redux/slices/authSlice';
import { useHubConnector } from './hooks/useHubConnector';
import Header from './components/Header';
import InputArea from './components/InputArea';
import Recat from './components/Recat';
import './styles/terminal.css';
import { isTypedArray } from 'util/types';
import type { ApiFlightplan } from './types/apiTypes/apiFlightplan';

const AppContent = () => {
  const dispatch = useRootDispatch();
  const vatsimToken = useRootSelector(vatsimTokenSelector);
  const session = useRootSelector(sessionSelector);

  useEffect(() => {
    dispatch(getVnasConfig());
  }, [dispatch]);

  const MainApp = () => {
    const [command, setCommand] = useState('');
    const [lastFeedback, setLastFeedback] = useState('');
    const [lastFeedbackErrorMessage, setLastFeedbackErrorMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const { sendCommand, disconnectHub, deleteFlightplan, amendFlightplan, requestFlightStrip, flightplans, flightStrips, hubConnection } = useHubConnector();
    const hubConnected = useRootSelector(hubConnectedSelector);


    // Blink cursor + maintain focus
    const [cursorVisible, setCursorVisible] = useState(true);
    useEffect(() => {
      const blinkInterval = setInterval(() => {
        setCursorVisible((prev) => !prev);
      }, 300);

      const ensureFocus = () => {
        if (document.activeElement !== terminalInputRef.current) {
          terminalInputRef.current?.focus();
        }
      };

      const focusInterval = setInterval(ensureFocus, 500);
      ensureFocus();

      return () => {
        clearInterval(blinkInterval);
        clearInterval(focusInterval);
      };
    }, []);
    // end blinking cursor/focus section

    // handle ESC clear, need to define response areas handling, REMOVE placeholder text and replace with '' when ready to deploy.
    const [responseTop, setResponseTop] = useState('');
    const [responseBottom, setResponseBottom] = useState('');

    const handleEscapeClear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTypedCommand('');
        setResponseTop('');
        setResponseBottom('');
        setLastFeedback('');
      }
    };

    useEffect(() => {
      window.addEventListener('keydown', handleEscapeClear);
      return () => window.removeEventListener('keydown', handleEscapeClear);
    }, []);

    // Listen for ReceiveStripItems events and display formatted strips
    useEffect(() => {
      if (!hubConnection) return;

      const handleStripPrint = (topic: any, stripItems: any[]) => {
        stripItems.forEach(strip => {
          if (strip?.fieldValues) {
            // Format using fieldValues from strip data based on ERAM strip layout
            // fieldValues: [0:callsign, 1:rev, 2:?, 3:type/equip, 4:cid, 5:beacon, 6:proptime, 7:alt, 8:dep/arr, 9-10:?, 11:route, 12:remarks]
            const fieldValues = strip.fieldValues;
            
            // Fixed column positions based on ERAM reference (80 char width)
            // Line 1: Aircraft ID (1-17), Beacon (19-23), Departure Point (25-36), Route (41-80)
            const line1_aircraftId = (fieldValues[0] || '').substring(0, 7).padEnd(14);
            const line1_beacon = (fieldValues[5] || '').substring(0, 4).padEnd(6);
            const line1_depPoint = (fieldValues[8]?.split(' ')[0] || '').substring(0, 7).padEnd(9);
            
            // Remove embedded newlines from route (both literal \n and escaped \\n) and replace with spaces
            let route = (fieldValues[11] || '');
            route = route.replace(/\\n/g, ' ').replace(/\n/g, ' ');
            let line1_route = route.substring(0, 40);
            let line2_route = '';
            
            console.log('Route info:', { fullRoute: route, length: route.length, needsContinuation: route.length > 40 });
            
            // Line 2: Revision Number (starts at position 3)
            const line2 = '  ' + (fieldValues[1] || '');
            
            // Line 3: Aircraft Type/Equipment (starts at column 1)
            const line3_typeEquip = (fieldValues[3] || '').substring(0, 14).padEnd(14);
            const line3_time = (fieldValues[6] || '').substring(0, 6).padEnd(6);
            
            // Line 4: CID (1-17), Altitude (19-23), Remarks (41-80)
            const line4_cid = (fieldValues[4] || '').substring(0, 4).padEnd(14);
            const line4_altitude = (fieldValues[7] || '').substring(0, 4).padEnd(15);
            let line4_remarks = (fieldValues[12] || '').substring(0, 40);
            if (route.split('○').length > 1) {
              line4_remarks = `○${route.split('○')[1]}`.substring(0, 40);
              route = route.split('○')[0]; // Show only the part before the ○ in the route field
            }
            // Route continuation - if route > 40 chars, continuation appears at column 41 on line 2
            // But revision number ALSO appears on line 2 at column 3
            //let line2_full = line2;
            let line1_route_display = line1_route;

            if (route.length > 40) {
              const first40 = route.slice(0, 40);
              const lastSpace = first40.lastIndexOf(' ');

              const splitIndex = lastSpace !== -1 ? lastSpace : 40;

              // Line 1 shows route up to the word boundary
              line1_route_display = route.slice(0, splitIndex);
              // Line 2 shows ONLY the continuation, padded so it aligns at column 41
              const secondLine = route.slice(splitIndex).trimStart();
              line2_route = secondLine;
            }
            
            // Build strip: Line1 + Line2(revision + route cont) + Line3(type/time) + Line4(cid/alt/remarks)
            const formattedStrip = 
              line1_aircraftId + line1_beacon + line1_depPoint + line1_route_display + '\n' +
              line2 + '\n' +
              line3_typeEquip + line3_time + line2_route + '\n\n' +
              line4_cid + line4_altitude + line4_remarks;
            
            console.log('ReceiveStripItems - Final formatted strip:', formattedStrip);
            
            // Move current responseBottom to responseTop and set new strip to responseBottom
            setResponseTop(responseBottom);
            setResponseBottom(formattedStrip);
          }
        });
      };

      hubConnection.on('ReceiveStripItems', handleStripPrint);

      return () => {
        hubConnection.off('ReceiveStripItems', handleStripPrint);
      };
    }, [hubConnection, responseBottom]);


    const handleCommandSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (command.trim() && !isProcessing) {
        setIsProcessing(true);
        setLastFeedback(''); // Clear previous feedback
        
        try {
          const result = await sendCommand(command.trim());
          setLastFeedback(`${command.toUpperCase()}\n\n${result.toUpperCase()}`);
          setCommand('');
        } catch (error) {
          console.error('Failed to send command:', error);
          setLastFeedback(`REJECT ${command.toUpperCase()}\n\n${error}`.toUpperCase());
        } finally {
          setIsProcessing(false);
        }
      }
    };

    const [typedCommand, setTypedCommand] = useState('');
    const terminalInputRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
      terminalInputRef.current?.focus();
    }, []);

    const parseCommand = async (input: string): Promise<string> => {
      const [command, ...args] = input.trim().split(/\s+/).map(s => s.toUpperCase());

      // Helper function to find flightplan by callsign, CID, or beacon code
      const findFlightplan = (identifier: string): ApiFlightplan | undefined => {
        if (!flightplans) return undefined;
        
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
      };

      switch (command) {
        case 'FP': {
          // Flight Plan message - FP <fields...>
          // Format: FP ACID TYPE/EQUIP SPEED FIX TIME ALT ROUTE REMARKS
          // Example: FP UAL423 B721/A 450 HAR P1720 170 HAR.V14.DCA O 1 VOR INOP
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
            // Parse time - should be 4 or 5 characters (HHMM or PXXDD format)
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
            // Parse altitude - format like 170 (FL170), OTP/115, VFR/75, etc.
            const altMatch = altStr.match(/^(\d+|OTP|VFR)(\/(\d+))?$/);
            if (!altMatch) {
              return `REJECT 08 ALT FORMAT`;
            }
            altitude = altStr;
          }
          
          // Field 10: Route - everything from field 6 onwards until we hit remarks
          // Route ends when we see 'O' or '@' prefix for remarks
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
            // Check if remarks start with O or @
            const remarksStr = remarksFields.join(' ');
            if (remarksStr.startsWith('O ')) {
              remarks = remarksStr.substring(2); // Interfacility remarks
            } else if (remarksStr.startsWith('@')) {
              remarks = remarksStr.substring(1); // Intrafacility remarks
            } else {
              remarks = remarksStr;
            }
          }
          
          try {
            // Check for duplicate active flight plan
            const existingFp = flightplans.get(aircraftId);
            if (existingFp && existingFp.status === 'Active') {
              return `REJECT 02 AID FLID\nDUPLICATION`;
            }
            
            await amendFlightplan({
              aircraftId,
              cid: '',
              status: 'Proposed',
              aircraftType: aircraftType,
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
        
        case 'AM': {
          // Amendment Message - AM <aircraft_id> <field_ref> <amendment_data> [<field_ref> <amendment_data>...]
          // Format: AM ACID 06 FIX 10 ROUTE or AM ACID SPD 225 RAL 90
          // Field references: AID, TYP, BCN, SPD, FIX, TIM, ALT, RAL, RTE, RMK
          const amMatch = /^AM\s+(.+)$/i.exec(input.trim());
          if (!amMatch) {
            return `REJECT 01 MSG INVALID\nMESSAGE TYPE`;
          }
          
          const parts = amMatch[1].split(/\s+/);
          if (parts.length < 3) {
            return `REJECT FORMAT - INSUFFICIENT FIELDS\n${input}`;
          }
          
          const aircraftId = parts[0];
          
          // Find the existing flightplan
          const existingFp = findFlightplan(aircraftId);
          if (!existingFp) {
            return `REJECT 02 FLID NOT\nSTORED`;
          }
          
          // Parse field references and amendments
          const amendments: { [key: string]: any } = {};
          let i = 1;
          let amendingAircraftId = false;
          
          while (i < parts.length) {
            const fieldRef = parts[i].toUpperCase();
            
            // Map field references to field numbers
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
              amendingAircraftId = true;
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
                  break; // Hit another field reference
                }
                amendmentData.push(parts[i]);
                i++;
              }
              
              if (amendmentData.length === 0) {
                return `REJECT 10 RTE FORMAT`;
              }
              
              // Process route amendment based on ERAM rules
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
                  // Last element becomes destination
                  amendments['destination'] = newRouteElements[newRouteElements.length - 1];
                  // For active flights, departure fix retained with tailoring symbol (/)
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
              // Merge with existing route - match first or last unambiguous element
              else {
                const firstElement = routeElements[0];
                const lastElement = routeElements[routeElements.length - 1];
                const existingElements = existingRoute.split(/[\s.]+/).filter(e => e.length > 0);
                
                // Try to find first element match
                const firstMatchIdx = existingElements.indexOf(firstElement);
                const lastMatchIdx = existingElements.lastIndexOf(lastElement);
                
                // Check if BOTH first and last match (replace between)
                if (firstMatchIdx !== -1 && lastMatchIdx !== -1 && firstMatchIdx < lastMatchIdx) {
                  const before = existingElements.slice(0, firstMatchIdx).join('.');
                  const after = existingElements.slice(lastMatchIdx + 1).join('.');
                  const merged = [before, routeStr, after].filter(p => p.length > 0).join('.');
                  amendments['route'] = merged;
                }
                // Only first element matches (replace after)
                else if (firstMatchIdx !== -1) {
                  const before = existingElements.slice(0, firstMatchIdx + 1).join('.');
                  amendments['route'] = `${before}.${routeElements.slice(1).join('.')}`;
                }
                // Only last element matches (replace before)
                else if (lastMatchIdx !== -1) {
                  const after = existingElements.slice(lastMatchIdx).join('.');
                  // For active flight, add tailoring symbol
                  if (existingFp.status === 'Active' && existingFp.departure) {
                    amendments['route'] = `${existingFp.departure}/.${routeElements.slice(0, -1).join('.')}.${after}`;
                  } else {
                    amendments['route'] = `${routeElements.slice(0, -1).join('.')}.${after}`;
                  }
                }
                // No match - just use new route
                else {
                  amendments['route'] = routeStr;
                }
              }
              
              // Check if Field 06 also needs amendment (required for Field 10 amendments per ERAM rules)
              // This will be validated when Field 06 is also in the amendment
            }
            // For other fields, just take the next token
            else {
              amendmentData.push(parts[i]);
              i++;
              
              const value = amendmentData[0];
              
              switch (fieldNum) {
                case '03': // Type/Equipment
                  const typeMatch = value.match(/^([A-Z0-9]+)\/([A-Z])$/);
                  if (!typeMatch) {
                    return `REJECT 03 TYP FORMAT`;
                  }
                  const newAircraftType = typeMatch[1];
                  const newFaaEquipmentSuffix = typeMatch[2];
                  
                  // Update equipment field by replacing only the aircraft type (before first /)
                  // and preserving everything after the first /
                  // Format: "B738/M-VGDW/C" -> "B752/M-VGDW/C"
                  let newEquipment = `${newAircraftType}/${newFaaEquipmentSuffix}`;
                  if (existingFp.equipment) {
                    const firstSlashIndex = existingFp.equipment.indexOf('/');
                    if (firstSlashIndex > 0) {
                      // Preserve everything after the first /
                      const everythingAfterSlash = existingFp.equipment.substring(firstSlashIndex + 1);
                      newEquipment = `${newAircraftType}/${everythingAfterSlash}`;
                    }
                  }
                  
                  amendments['equipment'] = newEquipment;
                  amendments['faaEquipmentSuffix'] = newFaaEquipmentSuffix;
                  break;
                  
                case '04': // Beacon Code
                  const beaconCode = parseInt(value);
                  if (isNaN(beaconCode) || beaconCode < 0 || beaconCode > 7777) {
                    return `REJECT 04 BCN CODE FORMAT`;
                  }
                  amendments['assignedBeaconCode'] = beaconCode;
                  break;
                  
                case '05': // Speed
                  const speed = parseInt(value);
                  if (isNaN(speed) || speed <= 0) {
                    return `REJECT 05 SPD ILLEGAL`;
                  }
                  if (speed > 3700) {
                    return `REJECT 05 SPD FORMAT`;
                  }
                  amendments['speed'] = speed;
                  break;
                  
                case '06': // Departure Fix
                  if (value.length < 2 || value.length > 12) {
                    return `REJECT 06 FIX FORMAT`;
                  }
                  amendments['departure'] = value;
                  break;
                  
                case '07': // Time
                  if (value !== 'E' && value !== 'P' && value !== 'D') {
                    const timeMatch = value.match(/^[PE]?(\d{4})$/);
                    if (!timeMatch) {
                      return `REJECT 07 TIM FORMAT`;
                    }
                    amendments['estimatedDepartureTime'] = parseInt(timeMatch[1]);
                  }
                  break;
                  
                case '08': // Assigned Altitude
                  amendments['altitude'] = value;
                  break;
                  
                case '09': // Requested Altitude (RAL)
                  // Store as altitude for now
                  amendments['altitude'] = value;
                  break;
                  
                case '11': // Remarks
                  // Collect all remaining parts as remarks
                  while (i < parts.length) {
                    const nextToken = parts[i].toUpperCase();
                    if (fieldMap[nextToken]) {
                      break;
                    }
                    amendmentData.push(parts[i]);
                    i++;
                  }
                  let remarks = amendmentData.join(' ');
                  // Remove O or @ prefix if present
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
          
          if (Object.keys(amendments).length === 0) {
            return `REJECT FORMAT - NO VALID AMENDMENTS\n${input}`;
          }
          
          try {
            // Build the amendment DTO, preserving existing values
            const amendDto: any = {
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
            
            await amendFlightplan(amendDto);
            
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
        
        case 'GI': {
          // General Information message - GI <recipient> <message>
          const giMatch = /^GI\s+(\S+)\s+(.+)$/i.exec(input.trim());
          if (giMatch && giMatch.length === 3) {
            const recipient = giMatch[1].toUpperCase();
            const message = giMatch[2];
            // TODO: Implement GI message sending via your hub/socket
            return `ACCEPT GI TO ${recipient}\n${message}`;
          } else {
            return `REJECT FORMAT\n${input}`;
          }
        }
        
        case 'WR': {
          // Weather Request - WR <station>
          if (args.length !== 1) {
            return `REJECT FORMAT\n${input}`;
          }
          const station = args[0];
          // TODO: Implement weather request
          return `ACCEPT WEATHER STAT REQ\n${station}`;
        }
        
        case 'SR': {
          // Strip Request - SR <aircraft_id>
          if (args.length !== 1) {
            return `REJECT FORMAT\n${input}`;
          }
          const identifier = args[0];
          
          // Find the aircraft (by callsign, CID, or beacon)
          let aircraftId = identifier;
          let strip = flightStrips?.get(identifier);
          
          if (!strip && flightStrips) {
            // Search by CID or beacon code
            for (const [id, s] of flightStrips) {
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
          
          if (strip?.fieldValues) {
            // Format using fieldValues from strip data based on ERAM strip layout
            // fieldValues: [0:callsign, 1:rev, 2:?, 3:type/equip, 4:cid, 5:beacon, 6:proptime, 7:alt, 8:dep/arr, 9-10:?, 11:route, 12:remarks]
            const fieldValues = strip.fieldValues;
            
            // Fixed column positions based on ERAM reference (80 char width)
            // Line 1: Aircraft ID (1-17), Beacon (19-23), Departure Point (25-36), Route (41-80)
            const line1_aircraftId = (fieldValues[0] || '').substring(0, 7).padEnd(14);
            const line1_beacon = (fieldValues[5] || '').substring(0, 4).padEnd(6);
            const line1_depPoint = (fieldValues[8]?.split(' ')[0] || '').substring(0, 7).padEnd(9);
            
            // Remove embedded newlines from route (both literal \n and escaped \\n) and replace with spaces
            let route = (fieldValues[11] || '');
            route = route.replace(/\\n/g, ' ').replace(/\n/g, ' ');
            let line1_route = route.substring(0, 40);
            let line2_route = '';
            
            console.log('Route info:', { fullRoute: route, length: route.length, needsContinuation: route.length > 40 });
            
            // Line 2: Revision Number (starts at position 3)
            const line2 = '  ' + (fieldValues[1] || '');
            
            // Line 3: Aircraft Type/Equipment (starts at column 1)
            const line3_typeEquip = (fieldValues[3] || '').substring(0, 14).padEnd(14);
            const line3_time = (fieldValues[6] || '').substring(0, 6).padEnd(6);
            
            // Line 4: CID (1-17), Altitude (19-23), Remarks (41-80)
            const line4_cid = (fieldValues[4] || '').substring(0, 4).padEnd(14);
            const line4_altitude = (fieldValues[7] || '').substring(0, 4).padEnd(15);
            let line4_remarks = (fieldValues[12] || '').substring(0, 40);
            if (route.split('○').length > 1) {
              line4_remarks = `○${route.split('○')[1]}`.substring(0, 40);
              route = route.split('○')[0]; // Show only the part before the ○ in the route field
            }
            // Route continuation - if route > 40 chars, continuation appears at column 41 on line 2
            // But revision number ALSO appears on line 2 at column 3
            //let line2_full = line2;
            let line1_route_display = line1_route;

            if (route.length > 40) {
              const first40 = route.slice(0, 40);
              const lastSpace = first40.lastIndexOf(' ');

              const splitIndex = lastSpace !== -1 ? lastSpace : 40;

              // Line 1 shows route up to the word boundary
              line1_route_display = route.slice(0, splitIndex);
              // Line 2 shows ONLY the continuation, padded so it aligns at column 41
              const secondLine = route.slice(splitIndex).trimStart();
              line2_route = secondLine;
            }
            
            // Build strip: Line1 + Line2(revision + route cont) + Line3(type/time) + Line4(cid/alt/remarks)
            const formattedStrip = 
              line1_aircraftId + line1_beacon + line1_depPoint + line1_route_display + '\n' +
              line2 + '\n' +
              line3_typeEquip + line3_time + line2_route + '\n\n' +
              line4_cid + line4_altitude + line4_remarks;
            
            // Print the strip (move responseBottom to responseTop, set new strip to responseBottom)
            setResponseTop(responseBottom);
            setResponseBottom(formattedStrip);
            
            // Also request from server to trigger ReceiveStripItems event (which will overwrite this with server's version)
            try {
              await requestFlightStrip(aircraftId);
            } catch (error) {
              console.warn('RequestFlightStrip failed:', error);
            }
            
            // Return the formatted strip data
            return formattedStrip;
          } else {
            return `REJECT\nSTRIP NOT FOUND\n${input}`;
          }
        }
        
        case 'FR': {
          // Flight Readout - FR <aircraft_id>
          if (args.length !== 1) {
            return `REJECT FORMAT\n${input}`;
          }
          const identifier = args[0];
          const flightplan = findFlightplan(identifier);
          
          if (flightplan) {
            // Format using ApiFlightplan data
            // aircraftID aircraftType assignedBeaconCode speed altitude departure route destination remarks
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
            
            // Route - break into 80 char chunks
            const route = flightplan.route || '';
            const maxLineLength = 80;
            const routeLines: string[] = [];
            for (let i = 0; i < route.length; i += maxLineLength) {
              routeLines.push(route.substring(i, i + maxLineLength));
            }
            
            return `${cid} ${aircraftId} ${aircraftType} ${beaconCode} ${speed} ${time} ${altitude} ${departure} ${route} ${destination} ${remarks}`;

          } else {
            return `FLID NOT STORED\n${input}`;
          }
        }
        
        case 'RS': {
          // Remove Strips - RS <aircraft_id>
          if (args.length !== 1) {
            return `REJECT FORMAT\n${input}`;
          }
          const identifier = args[0];
          const flightplan = findFlightplan(identifier);
          if (flightplan) {
            try {
              await deleteFlightplan(flightplan.aircraftId);
              return `${flightplan.aircraftId} ${flightplan.cid}REMOVE \nSTRIPS`;
            } catch (error) {
              console.error('Failed to delete flightplan:', error);
              // Parse the error message to extract relevant info
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
        
        default:
          // Send to ERAM hub for all other commands
          return await sendCommand(input);
      }
    };

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isProcessing) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const command = typedCommand.trim(); 
        if (!command) return;

        setIsProcessing(true);
        setLastFeedback('');
        
        try {
          const result = await parseCommand(command);
          console.log(` Command: ${command}, Result:`, result);
          
          // Check if result is a REJECT - if so, show ONLY in error area
          if (result.toUpperCase().startsWith('REJECT')) {
            setLastFeedbackErrorMessage(result);
            // Don't update responseBottom or responseTop for errors
          } else {
            // Success - clear errors and update response areas
            setLastFeedbackErrorMessage('');
            
            // Move current responseBottom to responseTop
            setResponseTop(responseBottom);
            
            // Set new response to responseBottom
            setResponseBottom(result);
          }
          // then dynamically add a scroll effect for each subsequent response's data to cycle it upwards.
        } catch (error) {
          const errorMsg = `REJECT ${typedCommand.toUpperCase()}\n\n${String(error).toUpperCase()}`;
          setLastFeedbackErrorMessage(errorMsg);
          // Don't update responseBottom or responseTop for errors
        } finally {
          setTypedCommand('');
          setIsProcessing(false);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setTypedCommand((prev) => prev.slice(0, -1));
      } else if (e.key.length === 1) {
        e.preventDefault();
        setTypedCommand((prev) => prev + e.key.toUpperCase());
      }
    };

    return (
      <div className='terminal-container items-center text-center text-lg bg-black h-screen text-fdio-green font-FDIO'>
        {/* Terminal Header */}
        <Header></Header>

        {/* Terminal Body */}
        <div className='terminal-body pt-5'>
          {/* Response Section (top half) */}
          {/* FDIO max character width is 80 */}
          <div className='response-section h-[440px]'>
            <div className='response-area-top h-[220px] w-[960px] m-auto whitespace-pre-wrap text-left'>
              {responseTop && '================================================================================\n'}{responseTop}
            </div>
            <div className='response-area-bottom h-[220px] w-[960px] m-auto whitespace-pre-wrap text-left'>
              {responseBottom && '================================================================================\n'}{responseBottom}
            </div>
          </div>
          {/* Command Section (Bottom Half) */}
          <div className='msg-response h-[150px] w-[960px] m-auto text-left whitespace-pre-wrap'>
              --------------------------------------------------------------------------------
              {isProcessing && (
                <div className='response-placeholder text-center'>M E S S A G E  W A I T I N G . . .</div>
              )}
              {lastFeedbackErrorMessage && (
                <div className='text-lg'>&nbsp;&nbsp;{lastFeedbackErrorMessage.toUpperCase()}</div>
              )}
          </div>
          
          {/* TO DO: BLINKING CURSOR BOX AND FORCED FOCUS */}
          <div className="command-section text-left w-[960px] m-auto text-fdio-green text-lg">
            <div
              className="terminal-input-area flex items-center outline-none whitespace-pre-wrap break-words"
              onKeyDown={handleKeyDown}
              tabIndex={0}
              ref={terminalInputRef}
            >
              <span className="typed-command">{typedCommand}</span>
              <span
                className={`ml-1 w-[1ch] h-[1.25em] bg-fdio-green ${
                  cursorVisible ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>

            {isProcessing && (
              <div>
                
              </div>
            )}
          </div>

          {/* Terminal Footer */}
          <div className='terminal-footer'>
            <div className='connection-status fixed bottom-4 left-4 text-xs'>
              <div className={`status-dot ${hubConnected ? '' : 'disconnected'}`}></div>
              <span>VNAS HUB: {hubConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
            </div>

            <div className='terminal-info fixed bottom-10 left-4 text-xs'>
              ARTCC: {session?.artccId?.toUpperCase() || 'N/A'} | STATUS: {session?.isActive ? 'ACTIVE' : 'INACTIVE'}
            </div>
            <Recat></Recat>
          </div>
        </div>
      </div>
    );
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={<LoginProvider />} 
        />
        <Route 
          path="/" 
          element={
            vatsimToken ? (
              <HubContextProvider>
                <MainApp />
              </HubContextProvider>
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
      </Routes>
    </BrowserRouter>
  );
};

export default function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}