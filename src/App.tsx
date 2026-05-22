import React, { useEffect, useState, useRef } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from './redux/store';
import { HubContextProvider } from './contexts/HubContext';
import LoginProvider from './login/Login';
import { useRootDispatch, useRootSelector } from './redux/hooks';
import { getVnasConfig, vatsimTokenSelector, sessionSelector, logoutThunk, hubConnectedSelector } from './redux/slices/authSlice';
import { setActiveRouteGroups, selectActiveRouteGroups, setActiveConfiguration, selectArtccId, selectActiveConfiguration } from './redux/slices/adaptedRoutingSlice';
import { useHubConnector } from './hooks/useHubConnector';
import { useAutoAdaptedRouting } from './hooks/useAutoAdaptedRouting';
import { useInitializeAdaptedRouting } from './hooks/useAdaptedRouting';
import { loadAtSpecialistConfigs, type ATSpecialistConfig } from './services/adaptedRoutingXmlParser';
import Header from './components/Header';
import InputArea from './components/InputArea';
import Recat from './components/Recat';
import './styles/terminal.css';
import { parseCommand } from './services/commandParser';
import { formatStripFromFieldValues } from './utils/stripFormatter';

const AppContent = () => {
  const dispatch = useRootDispatch();
  const vatsimToken = useRootSelector(vatsimTokenSelector);
  const session = useRootSelector(sessionSelector);

  useEffect(() => {
    dispatch(getVnasConfig());
  }, [dispatch]);

  const MainApp = () => {
    const [lastFeedbackErrorMessage, setLastFeedbackErrorMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const { sendCommand, disconnectHub, deleteFlightplan, amendFlightplan, requestFlightStrip, flightplans, flightStrips, hubConnection } = useHubConnector();
    const hubConnected = useRootSelector(hubConnectedSelector);
    const activeRouteGroups = useRootSelector(selectActiveRouteGroups);
    const artccId = useRootSelector(selectArtccId);
    const activeConfiguration = useRootSelector(selectActiveConfiguration);

    const { initialize, isInitialized: routingInitialized, error: routingError } = useInitializeAdaptedRouting();

    const [atSpecialistConfigs, setAtSpecialistConfigs] = useState<Map<string, ATSpecialistConfig>>(new Map());

    useEffect(() => {
      loadAtSpecialistConfigs(artccId).then(setAtSpecialistConfigs);
    }, [artccId]);

    // Derive the active numeric route groups from the current SA config
    const activeGroups = activeConfiguration
      ? (atSpecialistConfigs.get(activeConfiguration)?.activeGroups ?? [])
      : [];

    useEffect(() => {
      console.log('[AutoRouting] Initializing adapted routing service...');
      initialize();
    }, [initialize]);

    useEffect(() => {
      if (routingInitialized) console.log('[AutoRouting] Service initialized successfully');
      if (routingError) console.error('[AutoRouting] Initialization error:', routingError);
    }, [routingInitialized, routingError]);

    const autoRouting = useAutoAdaptedRouting(flightplans, {
      enabled: true,
      processOnChange: true,
      activeGroups,
    });

    useEffect(() => {
      console.log('[AutoRouting] State:', {
        isEnabled: autoRouting.isEnabled,
        isProcessing: autoRouting.isProcessing,
        lastProcessedAt: autoRouting.lastProcessedAt,
        stats: autoRouting.stats,
        error: autoRouting.error,
        flightplanCount: flightplans.size,
        activeRouteGroups,
      });
    }, [autoRouting.isEnabled, autoRouting.isProcessing, autoRouting.lastProcessedAt, autoRouting.stats, autoRouting.error, flightplans.size, activeRouteGroups]);


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

    const [responseTop, setResponseTop] = useState('');
    const [responseBottom, setResponseBottom] = useState('');

    const handleEscapeClear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTypedCommand('');
        setResponseTop('');
        setResponseBottom('');
      }
    };

    useEffect(() => {
      window.addEventListener('keydown', handleEscapeClear);
      return () => window.removeEventListener('keydown', handleEscapeClear);
    }, []);

    // Listen for ReceiveStripItems events and display formatted strips
    useEffect(() => {
      if (!hubConnection) return;

      const separatorTypes = ['RedSeparator', 'GreenSeparator', 'WhiteSeparator', 'HalfStripLeft'];

      const handleStripPrint = (topic: any, stripItems: any[]) => {
        stripItems.forEach(strip => {
          if (separatorTypes.includes(strip?.type)) return;
          if (strip?.fieldValues) {
            const formattedStrip = formatStripFromFieldValues(strip.fieldValues);
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


    const [typedCommand, setTypedCommand] = useState('');
    const terminalInputRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
      terminalInputRef.current?.focus();
    }, []);

    const commandContext = {
      flightplans,
      flightStrips,
      amendFlightplan,
      deleteFlightplan,
      requestFlightStrip,
      sendCommand,
      responseBottom,
      setResponseTop,
      setResponseBottom,
      setActiveRouteGroups: (groups: string[]) => dispatch(setActiveRouteGroups(groups)),
      setActiveConfiguration: (config: string | null) => dispatch(setActiveConfiguration(config)),
      activeConfiguration,
      atSpecialistConfigs,
    };

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isProcessing) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const command = typedCommand.trim(); 
        if (!command) return;

        setIsProcessing(true);
        
        try {
          const result = await parseCommand(command, commandContext);
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
              {/* <span>VNAS HUB: {hubConnected ? 'CONNECTED' : 'DISCONNECTED'}</span> */}
            </div>

            <div className='terminal-info fixed bottom-10 left-4 text-xs'>
              {/* ARTCC: {session?.artccId?.toUpperCase() || 'N/A'} | STATUS: {session?.isActive ? 'ACTIVE' : 'INACTIVE'} */}
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