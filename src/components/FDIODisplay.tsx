import React, { useEffect, useState, useRef } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from '../redux/store';
import { HubContextProvider } from '../contexts/HubContext';
import LoginProvider from '../login/Login';
import { useRootDispatch, useRootSelector } from '../redux/hooks';
import { getVnasConfig, vatsimTokenSelector, hubConnectedSelector } from '../redux/slices/authSlice';
import { setActiveRouteGroups, setActiveConfiguration, selectArtccId, selectActiveConfiguration } from '../redux/slices/adaptedRoutingSlice';
import { useHubConnector } from '../hooks/useHubConnector';
import { useAutoAdaptedRouting } from '../hooks/useAutoAdaptedRouting';
import { useInitializeAdaptedRouting } from '../hooks/useAdaptedRouting';
import { loadAtSpecialistConfigs, type ATSpecialistConfig } from '../services/adaptedRoutingXmlParser';
import Header from './Header';
import Recat from './Recat';
import '../styles/terminal.css';
import { parseCommand } from '../services/commandParser';
import { formatStripFromFieldValues } from '../utils/stripFormatter';

export interface FDIODisplayProps {
  /**
   * When true, the component is embedded inside a TDLS host application.
   * The Header (logout button) and footer (connection dot, Recat) are hidden,
   * and inline styles are used instead of Tailwind classes so the host app
   * does not need to import Tailwind or the FDIO font.
   */
  hostIsTdls?: boolean;
}

// ─── Inner terminal UI ──────────────────────────────────────────────────────

const FDIOMain = ({ hostIsTdls }: Required<FDIODisplayProps>) => {
  const dispatch = useRootDispatch();
  const hubConnected = useRootSelector(hubConnectedSelector);
  const artccId = useRootSelector(selectArtccId);
  const activeConfiguration = useRootSelector(selectActiveConfiguration);

  const {
    sendCommand,
    deleteFlightplan,
    amendFlightplan,
    requestFlightStrip,
    flightplans,
    flightStrips,
    hubConnection,
  } = useHubConnector();

  const { initialize, isInitialized: routingInitialized, error: routingError } = useInitializeAdaptedRouting();

  const [atSpecialistConfigs, setAtSpecialistConfigs] = useState<Map<string, ATSpecialistConfig>>(new Map());
  useEffect(() => { loadAtSpecialistConfigs(artccId).then(setAtSpecialistConfigs); }, [artccId]);

  const activeGroups = activeConfiguration
    ? (atSpecialistConfigs.get(activeConfiguration)?.activeGroups ?? [])
    : [];

  useEffect(() => { initialize(); }, [initialize]);

  useEffect(() => {
    if (routingInitialized) console.log('[AutoRouting] Service initialized successfully');
    if (routingError) console.error('[AutoRouting] Initialization error:', routingError);
  }, [routingInitialized, routingError]);

  useAutoAdaptedRouting(flightplans, { enabled: true, processOnChange: true, activeGroups });

  // State
  const [responseTop, setResponseTop] = useState('');
  const [responseBottom, setResponseBottom] = useState('');
  const [lastFeedbackErrorMessage, setLastFeedbackErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [typedCommand, setTypedCommand] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  const terminalInputRef = useRef<HTMLDivElement>(null);

  // Cursor blink + focus maintenance
  useEffect(() => {
    const blinkInterval = setInterval(() => setCursorVisible(v => !v), 300);
    const focusInterval = setInterval(() => {
      if (document.activeElement !== terminalInputRef.current) {
        terminalInputRef.current?.focus();
      }
    }, 500);
    terminalInputRef.current?.focus();
    return () => { clearInterval(blinkInterval); clearInterval(focusInterval); };
  }, []);

  // Escape clears all display areas
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTypedCommand('');
        setResponseTop('');
        setResponseBottom('');
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Strip print events from hub
  useEffect(() => {
    if (!hubConnection) return;
    const separatorTypes = ['RedSeparator', 'GreenSeparator', 'WhiteSeparator', 'HalfStripLeft'];
    const handleStripPrint = (_topic: any, stripItems: any[]) => {
      stripItems.forEach(strip => {
        if (separatorTypes.includes(strip?.type)) return;
        if (strip?.fieldValues) {
          const formatted = formatStripFromFieldValues(strip.fieldValues);
          setResponseTop(prev => prev); // read stable reference via functional update below
          setResponseBottom(prev => {
            setResponseTop(prev);
            return formatted;
          });
        }
      });
    };
    hubConnection.on('ReceiveStripItems', handleStripPrint);
    return () => { hubConnection.off('ReceiveStripItems', handleStripPrint); };
  }, [hubConnection]);

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
        if (result.toUpperCase().startsWith('REJECT')) {
          setLastFeedbackErrorMessage(result);
        } else {
          setLastFeedbackErrorMessage('');
          setResponseTop(responseBottom);
          setResponseBottom(result);
        }
      } catch (error) {
        setLastFeedbackErrorMessage(`REJECT ${typedCommand.toUpperCase()}\n\n${String(error).toUpperCase()}`);
      } finally {
        setTypedCommand('');
        setIsProcessing(false);
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      setTypedCommand(prev => prev.slice(0, -1));
    } else if (e.key.length === 1) {
      e.preventDefault();
      setTypedCommand(prev => prev + e.key.toUpperCase());
    }
  };

  if (hostIsTdls) {
    // ── TDLS-embedded variant: inline styles, no Header/footer ──
    return (
      <div style={{
        backgroundColor: '#fff',
        color: '#000',
        fontFamily: 'monospace',
        fontSize: '1rem',
        width: '960px',
        userSelect: 'none',
      }}>
        <div style={{ paddingTop: '20px' }}>
          <div style={{ height: '440px' }}>
            <div style={{ height: '220px', width: '960px', whiteSpace: 'pre-wrap', textAlign: 'left', overflowY: 'auto' }}>
              {responseTop && '================================================================================\n'}{responseTop}
            </div>
            <div style={{ height: '220px', width: '960px', whiteSpace: 'pre-wrap', textAlign: 'left', overflowY: 'auto' }}>
              {responseBottom && '================================================================================\n'}{responseBottom}
            </div>
          </div>
          <div style={{ height: '150px', width: '960px', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
            {'--------------------------------------------------------------------------------'}
            {isProcessing && (
              <div style={{ textAlign: 'center' }}>M E S S A G E  W A I T I N G . . .</div>
            )}
            {lastFeedbackErrorMessage && (
              <div>&nbsp;&nbsp;{lastFeedbackErrorMessage.toUpperCase()}</div>
            )}
          </div>
          <div style={{ textAlign: 'left', width: '960px' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              onKeyDown={handleKeyDown}
              tabIndex={0}
              ref={terminalInputRef}
            >
              <span>{typedCommand}</span>
              <span style={{
                display: 'inline-block',
                marginLeft: '2px',
                width: '0.75ch',
                height: '1.25em',
                backgroundColor: '#000',
                opacity: cursorVisible ? 1 : 0,
              }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Standalone variant: Tailwind classes + Header + footer ──
  return (
    <div className='terminal-container items-center text-center text-lg bg-black h-screen text-fdio-green font-FDIO'>
      <Header />
      <div className='terminal-body pt-5'>
        <div className='response-section h-[440px]'>
          <div className='response-area-top h-[220px] w-[960px] m-auto whitespace-pre-wrap text-left'>
            {responseTop && '================================================================================\n'}{responseTop}
          </div>
          <div className='response-area-bottom h-[220px] w-[960px] m-auto whitespace-pre-wrap text-left'>
            {responseBottom && '================================================================================\n'}{responseBottom}
          </div>
        </div>
        <div className='msg-response h-[150px] w-[960px] m-auto text-left whitespace-pre-wrap'>
          {'--------------------------------------------------------------------------------'}
          {isProcessing && (
            <div className='response-placeholder text-center'>M E S S A G E  W A I T I N G . . .</div>
          )}
          {lastFeedbackErrorMessage && (
            <div className='text-lg'>&nbsp;&nbsp;{lastFeedbackErrorMessage.toUpperCase()}</div>
          )}
        </div>
        <div className='command-section text-left w-[960px] m-auto text-fdio-green text-lg'>
          <div
            className='terminal-input-area flex items-center outline-none whitespace-pre-wrap break-words'
            onKeyDown={handleKeyDown}
            tabIndex={0}
            ref={terminalInputRef}
          >
            <span className='typed-command'>{typedCommand}</span>
            <span className={`ml-1 w-[1ch] h-[1.25em] bg-fdio-green ${cursorVisible ? 'opacity-100' : 'opacity-0'}`} />
          </div>
        </div>
        <div className='terminal-footer'>
          <div className='connection-status fixed bottom-4 left-4 text-xs'>
            <div className={`status-dot ${hubConnected ? '' : 'disconnected'}`} />
          </div>
          <Recat />
        </div>
      </div>
    </div>
  );
};

// ─── Router + auth gating ────────────────────────────────────────────────────

const FDIOContent = ({ hostIsTdls }: Required<FDIODisplayProps>) => {
  const dispatch = useRootDispatch();
  const vatsimToken = useRootSelector(vatsimTokenSelector);

  useEffect(() => { dispatch(getVnasConfig()); }, [dispatch]);

  return (
    <Routes>
      <Route path='/login' element={<LoginProvider />} />
      <Route
        path='/'
        element={
          vatsimToken ? (
            <HubContextProvider>
              <FDIOMain hostIsTdls={hostIsTdls} />
            </HubContextProvider>
          ) : (
            <Navigate to='/login' replace />
          )
        }
      />
    </Routes>
  );
};

// ─── Public export ───────────────────────────────────────────────────────────

/**
 * Self-contained FDIO display component.
 *
 * Provides its own Redux store and router (MemoryRouter, so navigation stays
 * internal and does not affect the host app's URL).
 *
 * @param hostIsTdls  When `true` (TDLS-embedded mode): shows only the terminal
 *                    body with inline styles; Header and footer are hidden.
 *                    When `false` (standalone mode, default): full terminal
 *                    with Tailwind classes, Header, and footer.
 */
export const FDIODisplay = ({ hostIsTdls = false }: FDIODisplayProps) => (
  <Provider store={store}>
    <MemoryRouter>
      <FDIOContent hostIsTdls={hostIsTdls} />
    </MemoryRouter>
  </Provider>
);

export default FDIODisplay;
