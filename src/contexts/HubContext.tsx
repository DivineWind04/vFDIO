import type { ReactNode } from "react";
import React, { createContext, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { HubConnection } from "@microsoft/signalr";
import { HttpTransportType, HubConnectionBuilder } from "@microsoft/signalr";
import type { Nullable } from "../types/utility-types";
import {
  clearSession,
  envSelector,
  setSession,
  vatsimTokenSelector,
  setSessionIsActive,
  setHubConnected,
  hubConnectedSelector,
  logout,
} from "../redux/slices/authSlice";
import { refreshToken } from "../api/vNasDataApi";
import type { ApiSessionInfoDto } from "../types/apiTypes/apiSessionInfoDto";
import type { ApiFlightplan, CreateOrAmendFlightplanDto } from "../types/apiTypes/apiFlightplan";
import { ApiTopic } from "../types/apiTypes/apiTopic";
import { updateFlightplanThunk, deleteFlightplanThunk, initThunk } from "../redux/thunks";
import { openWindowThunk } from "../redux/thunks/windowThunks";
import { addOutageMessage, delOutageMessage, setFsdIsConnected } from "../redux/slices/appSlice";
import { setMcaAcceptMessage, setMcaRejectMessage, setMraMessage } from "../redux/slices/mcaSlice";
import { setArtccId, setSectorId } from "../redux/slices/sectorSlice";
import { useRootDispatch, useRootSelector } from "../redux/hooks";
import { useSocketConnector } from "../hooks/useSocketConnector";
import { VERSION } from "../utils/constants";
import { OutageEntry } from "../types/outageEntry";
import { HubConnectionState } from "@microsoft/signalr/dist/esm/HubConnection";
import { invokeHub } from "../utils/hubUtils";
import { type ProcessEramMessageDto, type EramMessageProcessingResultDto, EramPositionType } from "../types/apiTypes/eramTypes";

// Simple toast for now
const toast = {
  error: (message: string) => console.error(message)
};

type HubContextValue = {
  connectHub: () => Promise<void>;
  disconnectHub: () => Promise<void>;
  hubConnection: HubConnection | null;
  sendEramMessage: (eramMessage: ProcessEramMessageDto) => Promise<EramMessageProcessingResultDto | void>;
  sendCommand: (command: string) => Promise<string>;
  amendFlightplan: (fp: CreateOrAmendFlightplanDto) => Promise<void>;
  deleteFlightplan: (aircraftId: string) => Promise<void>;
  requestFlightStrip: (aircraftId: string) => Promise<void>;
  flightplans: Map<string, ApiFlightplan>;
  flightStrips: Map<string, any>;
};

export const HubContext = createContext<HubContextValue>({
  connectHub: () => Promise.reject(new Error('HubContext not initialized')),
  disconnectHub: () => Promise.reject(new Error('HubContext not initialized')),
  hubConnection: null,
  sendEramMessage: () => Promise.reject(new Error('HubContext not initialized')),
  sendCommand: () => Promise.reject(new Error('HubContext not initialized')),
  amendFlightplan: () => Promise.reject(new Error('HubContext not initialized')),
  deleteFlightplan: () => Promise.reject(new Error('HubContext not initialized')),
  requestFlightStrip: () => Promise.reject(new Error('HubContext not initialized')),
  flightplans: new Map(),
  flightStrips: new Map(),
});

export const HubContextProvider = ({ children }: { children: ReactNode }) => {
  const dispatch = useRootDispatch();
  const vatsimToken = useRootSelector(vatsimTokenSelector)!;
  const ref = useRef<Nullable<HubConnection>>(null);
  const { disconnectSocket } = useSocketConnector();
  const env = useRootSelector(envSelector);
  const navigate = useNavigate();
  const hubConnected = useRootSelector(hubConnectedSelector);
  const [flightplans, setFlightplans] = useState<Map<string, ApiFlightplan>>(new Map());
  const [flightStrips, setFlightStrips] = useState<Map<string, any>>(new Map());
  const [facilityId, setFacilityId] = useState<string>("");

  const disconnectHub = useCallback(async () => {
    try {
      await ref.current?.stop();
      dispatch(setHubConnected(false));
      dispatch(setArtccId(""));
      dispatch(setSectorId(""));

      try {
        disconnectSocket();
      } catch (error) {
        console.warn("Error disconnecting socket:", error);
      }

      dispatch(clearSession());
      dispatch(logout());
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Error during hub disconnect:", error);
      navigate("/login", { replace: true });
    }
  }, [disconnectSocket, dispatch, navigate]);

  const handleSessionStart = useCallback(
    async (sessionInfo: ApiSessionInfoDto, hubConnection: HubConnection) => {
      if (!sessionInfo || sessionInfo.isPseudoController) {
        return;
      }

      try {
        const primaryPosition = sessionInfo.positions.find((p) => p.isPrimary)?.position;

        if (!primaryPosition) {
          throw new Error("No primary position found");
        }

        const artccId = sessionInfo.artccId;
        // For ERAM positions, use the sectorId; for other positions like tower, use the callsign
        const sectorId = primaryPosition.eramConfiguration?.sectorId || primaryPosition.callsign || "UNKNOWN";
        
        console.log('Primary position details:', {
          callsign: primaryPosition.callsign,
          name: primaryPosition.name,
          hasEramConfig: !!primaryPosition.eramConfiguration,
          eramSectorId: primaryPosition.eramConfiguration?.sectorId,
          finalSectorId: sectorId
        });

        dispatch(setArtccId(artccId));
        dispatch(setSectorId(sectorId));
        dispatch(setSession(sessionInfo));
        dispatch(setSessionIsActive(sessionInfo.isActive ?? false));
        dispatch(initThunk());

        if (hubConnection.state === HubConnectionState.Connected) {
          const joinSessionParams = {
            sessionId: sessionInfo.id,
            clientName: "vEDST",
            clientVersion: VERSION,
            hasEramConfig: true,
            eramSectorId: 99
          };
          console.log('Sending joinSession with params:', joinSessionParams);
          await hubConnection.invoke<void>("joinSession", joinSessionParams);
          console.log(`Joined session ${sessionInfo.id} with position ${primaryPosition.callsign} (${primaryPosition.name})`);

          const artccFacilityId = sessionInfo.artccId; // Use ARTCC ID instead of facility ID
          const primaryFacilityId = sessionInfo.positions.find((p) => p.isPrimary)?.facilityId;
          
          // Store facility ID for later use
          if (primaryFacilityId) {
            setFacilityId(primaryFacilityId);
          }
          
          if (artccFacilityId) {
            try {
              // Subscribe to FlightPlans using ARTCC ID (e.g., ZOA instead of OAK)
              const initialFlightplans = await hubConnection.invoke<ApiFlightplan[]>("subscribe", new ApiTopic("FlightPlans", artccFacilityId));
              
              if (initialFlightplans && Array.isArray(initialFlightplans)) {
                setFlightplans(prev => {
                  const newMap = new Map(prev);
                  initialFlightplans.forEach(fp => {
                    if (fp?.aircraftId) {
                      newMap.set(fp.aircraftId, fp);
                      dispatch(updateFlightplanThunk(fp));
                    }
                  });
                  return newMap;
                });
              }

              // Subscribe to FlightStrips using facility ID (e.g., OAK)
              if (primaryFacilityId) {
                const initialFlightStrips = await hubConnection.invoke<any[]>("subscribe", new ApiTopic("FlightStrips", primaryFacilityId));
                console.log("Subscribed to FlightStrips, received:", initialFlightStrips);
                
                if (initialFlightStrips && Array.isArray(initialFlightStrips)) {
                  setFlightStrips(prev => {
                    const newMap = new Map(prev);
                    initialFlightStrips.forEach(strip => {
                      if (strip?.aircraftId) {
                        newMap.set(strip.aircraftId, strip);
                      }
                    });
                    return newMap;
                  });
                }
              }
              
            } catch (subscribeError) {
              console.warn(`Failed to subscribe: ${subscribeError}`);
            }
          }
          dispatch(setHubConnected(true));
        } else {
          throw new Error("Hub connection not in Connected state");
        }
      } catch (error: any) {
        console.error("Session start failed:", error);
        toast.error(error.message);
        await disconnectHub();
      }
    },
    [dispatch, disconnectHub]
  );

  useEffect(() => {
    if (!env || !vatsimToken) {
      return;
    }

    const hubUrl = env.clientHubUrl;

    const getValidNasToken = async () => {
      return refreshToken(env.apiBaseUrl, vatsimToken).then((r) => {
        console.log("Refreshed NAS token");
        return r.data;
      });
    };

    ref.current = new HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: getValidNasToken,
        transport: HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect()
      .build();

    const hubConnection = ref.current;

    hubConnection.onclose(() => {
      dispatch(setArtccId(""));
      dispatch(setSectorId(""));
      dispatch(setHubConnected(false));
      console.log("ATC hub disconnected");
      navigate("/login", { replace: true });
    });

    hubConnection.on("HandleSessionStarted", (sessionInfo: ApiSessionInfoDto) => {
      console.log("Session started:", sessionInfo);
      handleSessionStart(sessionInfo, hubConnection);
    });

    hubConnection.on("HandleSessionEnded", () => {
      console.log("clearing session");
      dispatch(clearSession());
      disconnectHub();
    });

    hubConnection.on("ReceiveFlightPlans", async (topic: ApiTopic, flightplans: ApiFlightplan[]) => {
      if (flightplans && Array.isArray(flightplans)) {
        setFlightplans(prev => {
          const newMap = new Map(prev);
          flightplans.forEach(fp => {
            if (fp?.aircraftId) {
              newMap.set(fp.aircraftId, fp);
              dispatch(updateFlightplanThunk(fp));
            }
          });
          return newMap;
        });
      }
    });

    hubConnection.on("DeleteFlightplans", async (topic: ApiTopic, flightplanIds: string[]) => {
      flightplanIds.forEach((flightplanId) => {
        setFlightplans(prev => {
          const newMap = new Map(prev);
          newMap.delete(flightplanId);
          return newMap;
        });
        dispatch(deleteFlightplanThunk(flightplanId));
      });
    });

    hubConnection.on("ReceiveStripItems", async (topic: any, stripItems: any[]) => {
      console.log("Received ReceiveStripItems:", stripItems);
      if (stripItems && Array.isArray(stripItems)) {
        setFlightStrips(prev => {
          const newMap = new Map(prev);
          stripItems.forEach(strip => {
            if (strip?.aircraftId) {
              newMap.set(strip.aircraftId, strip);
            }
          });
          return newMap;
        });
      }
    });

    hubConnection.on("HandleFsdConnectionStateChanged", (state: boolean) => {
      dispatch(setFsdIsConnected(state));
      if (!state) {
        dispatch(addOutageMessage(new OutageEntry("FSD_DOWN", "FSD CONNECTION DOWN")));
      } else {
        dispatch(delOutageMessage("FSD_DOWN"));
      }
    });

    hubConnection.on("SetSessionActive", (isActive) => {
      dispatch(setSessionIsActive(isActive));
      sessionStorage.setItem("session-active", `${isActive}`);
    });

    hubConnection.keepAliveIntervalInMilliseconds = 1000;
  }, [dispatch, navigate, disconnectHub, handleSessionStart, env, vatsimToken]);

  const connectHub = useCallback(async () => {
    if (!env || !vatsimToken || !ref.current) {
      if (ref.current?.state === HubConnectionState.Connected) {
        dispatch(setHubConnected(true));
        return;
      }
      dispatch(setHubConnected(false));
      throw new Error(`Cannot connect - env: ${!!env}, token: ${!!vatsimToken}, ref: ${!!ref.current}`);
    }

    const hubConnection = ref.current;

    if (hubConnection.state !== HubConnectionState.Connected) {
      try {
        await hubConnection.start();
        console.log("Connected to hub, waiting for session...");

        try {
          const sessions = await hubConnection.invoke<ApiSessionInfoDto[]>("GetSessions");
          const primarySession = sessions?.find((s) => !s.isPseudoController);
          console.log("Available sessions:", sessions);
          const primaryPosition = primarySession?.positions.find((p) => p.isPrimary)?.position;

          console.log(sessions);
          console.log(primarySession);

          if (primarySession && primaryPosition) {
            console.log(`Found primary position: ${primaryPosition.callsign} (${primaryPosition.name})`);
            console.log(hubConnection);
            await handleSessionStart(primarySession, hubConnection);
            console.log(`joined existing session ${primarySession.id}`);
          } else {
            console.log("No primary session found, waiting for HandleSessionStarted event");
          }
        } catch (error) {
          console.log(error);
          console.log("No active session yet, waiting for HandleSessionStarted event");
        }
      } catch (error) {
        dispatch(setHubConnected(false));
        throw error;
      }
    }
  }, [dispatch, handleSessionStart, env, vatsimToken]);

  const sendEramMessage = useCallback(async (eramMessage: ProcessEramMessageDto) => {
    return invokeHub<EramMessageProcessingResultDto>(ref.current, connectHub, async (connection) => {
      const result = await connection.invoke<EramMessageProcessingResultDto>("processEramMessage", eramMessage);
      if (result) {
        if (result.isSuccess) {
          const feedbackMessage = result.feedback.length > 0 ? result.feedback.join("\n") : "Command accepted";
          console.log("ERAM command processed successfully:", feedbackMessage);

          if (result.response) {
            dispatch(setMraMessage(result.response));
            dispatch(openWindowThunk("MESSAGE_RESPONSE_AREA"));
          }
        } else {
          const rejectMessage = result.feedback.length > 0 ? `REJECT\n${result.feedback.join("\n")}` : "REJECT\nCommand failed";
          console.log("ERAM command processing failed:", rejectMessage);
        }
      }
      return result;
    });
  }, [connectHub, dispatch]);

  const amendFlightplan = useCallback(async (fp: CreateOrAmendFlightplanDto) => {
    return invokeHub<void>(ref.current, connectHub, async (connection) => {
      await connection.invoke<void>("amendFlightPlan", fp);
    });
  }, [connectHub]);

  const deleteFlightplan = useCallback(async (aircraftId: string) => {
    // Workaround: "delete" by amending the flightplan to be blank/empty
    try {
      console.log(`Attempting to delete flightplan by clearing data: ${aircraftId}`);
      await amendFlightplan({
        aircraftId: aircraftId,
        cid: '',
        status: 'Proposed',
        aircraftType: '',
        faaEquipmentSuffix: '',
        equipment: '',
        icaoEquipmentCodes: '',
        icaoSurveillanceCodes: '',
        speed: 0,
        altitude: '',
        departure: '',
        destination: '',
        alternate: '',
        route: '',
        remarks: '',
        assignedBeaconCode: null,
        estimatedDepartureTime: 0,
        actualDepartureTime: 0,
        hoursEnroute: 0,
        minutesEnroute: 0,
        fuelHours: 0,
        fuelMinutes: 0,
        pilotCid: '',
        holdAnnotations: null,
        wakeTurbulenceCode: '',
      });
      console.log(`Cleared flightplan data for: ${aircraftId}`);
      
      // Only remove from local state if server operation succeeded
      setFlightplans(prev => {
        const newMap = new Map(prev);
        newMap.delete(aircraftId);
        return newMap;
      });
      dispatch(deleteFlightplanThunk(aircraftId));
    } catch (error) {
      console.error(`Failed to clear flightplan: ${error}`);
      // Re-throw the error so the caller can handle it
      throw error;
    }
  }, [amendFlightplan, dispatch]);

  const requestFlightStrip = useCallback(async (aircraftId: string) => {
    return invokeHub<void>(ref.current, connectHub, async (connection) => {
      await connection.invoke<void>("RequestFlightStrip", facilityId, aircraftId.toUpperCase());
    });
  }, [connectHub, facilityId]);

  const sendCommand = useCallback(async (command: string): Promise<string> => {
    const trimmedCommand = command.trim().toUpperCase();
    const parts = trimmedCommand.split(' ');
    
    try {
      const elements = parts.map(token => ({
        token: token
      }));

      // Always use DSide (ERAM) position type to allow ERAM commands from any position
      const eramMessage: ProcessEramMessageDto = {
        source: EramPositionType.DSide,
        elements,
        invertNumericKeypad: false
      };

      const result = await sendEramMessage(eramMessage);
      
      if (result) {
        if (result.isSuccess) {
          console.log(result);
          const feedback = result.feedback?.length > 0 ? result.feedback.join("\n") : "";
          const response = result.response || "";
          
          if (feedback && response) {
            return `${feedback}\n${response}`;
          } else if (response) {
            return response;
          } else if (feedback) {
            return feedback;
          } else {
            return "COMMAND ACCEPTED";
          }
        } else {
          return `REJECT: ${result.feedback.join("\n") || "COMMAND FAILED"}`;
        }
      } else {
        return "ERROR: NO RESPONSE FROM SERVER";
      }
      
    } catch (error) {
      console.error('Command processing failed:', error);
      return `ERROR: ${error}`;
    }
  }, [flightplans, sendEramMessage]);

  // Auto-connect when the provider is mounted and we have token + env
  useEffect(() => {
    if (vatsimToken && env) {
      const timer = setTimeout(() => {
        console.log("Auto-connecting to hub...");
        connectHub().catch((error) => {
          console.error("Auto-connect failed:", error);
        });
      }, 1000); // Give a moment for the component to settle

      return () => clearTimeout(timer);
    }
  }, [vatsimToken, env, connectHub]);

  const contextValue = useMemo(() => ({
    hubConnection: ref.current,
    hubConnected,
    connectHub,
    disconnectHub,
    sendEramMessage,
    sendCommand,
    amendFlightplan,
    deleteFlightplan,
    requestFlightStrip,
    flightplans,
    flightStrips,
  }), [hubConnected, connectHub, disconnectHub, sendEramMessage, sendCommand, amendFlightplan, deleteFlightplan, requestFlightStrip, flightplans, flightStrips]);

  return <HubContext.Provider value={contextValue}>{children}</HubContext.Provider>;
};
