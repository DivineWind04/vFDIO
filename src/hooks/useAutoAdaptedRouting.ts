import { useEffect, useCallback, useRef, useState, useContext } from 'react';
import { useRootSelector } from '../redux/hooks';
import { HubContext } from '../contexts/HubContext';
import type { ApiFlightplan, CreateOrAmendFlightplanDto } from '../types/apiTypes/apiFlightplan';
import type { RootState } from '../redux/store';
import {
  processAllFlightplans,
  processSingleFlightplan,
  findBestRouteForFlightplan,
  ProcessingStats,
  ProcessingResult,
  RouteAmendmentResult
} from '../services/autoAdaptedRoutingProcessor';
import { CustomFlightplanService } from '../services/customFlightplanService';
import { adaptedRoutingsService } from '../services/adaptedRoutingService';

interface AutoProcessingState {
  isProcessing: boolean;
  lastProcessedAt: number | null;
  stats: ProcessingStats | null;
  error: string | null;
}

/**
 * Hook for automatic adapted routing processing
 * Processes all flightplans and amends them with the best available adapted route
 */
export function useAutoAdaptedRouting(
  flightplansMap: Map<string, ApiFlightplan>,
  options: {
    enabled?: boolean;
    processOnChange?: boolean;
    debounceMs?: number;
    activeGroups?: string[];
  } = {}
) {
  const { 
    enabled = true, 
    processOnChange = true, 
    debounceMs = 1000,
    activeGroups = []
  } = options;
  
  const hubContext = useContext(HubContext);
  const [state, setState] = useState<AutoProcessingState>({
    isProcessing: false,
    lastProcessedAt: null,
    stats: null,
    error: null
  });
  
  // Check if service is initialized
  const isInitialized = adaptedRoutingsService.isInitialized();
  
  // Track processed flightplans to avoid re-processing
  const processedFlightplans = useRef<Set<string>>(new Set());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Amendment function that wraps hub context
  const amendFlightplan = useCallback(async (dto: CreateOrAmendFlightplanDto): Promise<void> => {
    if (!hubContext) {
      throw new Error('Hub context not available');
    }
    await hubContext.amendFlightplan(dto);
  }, [hubContext]);
  
  /**
   * Process all flightplans in the map
   */
  const processAll = useCallback(async (): Promise<ProcessingStats | null> => {
    if (!enabled || !isInitialized || state.isProcessing) {
      return null;
    }
    
    setState(prev => ({ ...prev, isProcessing: true, error: null }));
    
    try {
      const fpService = new CustomFlightplanService(flightplansMap);
      const stats = await processAllFlightplans(fpService, amendFlightplan, activeGroups);
      
      // Mark all processed flightplans
      stats.results.forEach(result => {
        if (result.success) {
          processedFlightplans.current.add(result.aircraftId);
        }
      });
      
      setState({
        isProcessing: false,
        lastProcessedAt: Date.now(),
        stats,
        error: null
      });
      
      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: errorMessage
      }));
      return null;
    }
  }, [enabled, isInitialized, state.isProcessing, flightplansMap, activeGroups, amendFlightplan]);
  
  /**
   * Process a single flightplan
   */
  const processSingle = useCallback(async (flightplan: ApiFlightplan): Promise<ProcessingResult | null> => {
    if (!enabled || !isInitialized) {
      return null;
    }
    
    // Skip if already processed
    if (processedFlightplans.current.has(flightplan.aircraftId)) {
      return null;
    }
    
    try {
      const result = await processSingleFlightplan(flightplan, amendFlightplan, activeGroups);

      // Mark as processed regardless (avoid repeated rechecks for already-adapted flights)
      processedFlightplans.current.add(flightplan.aircraftId);

      return result;
    } catch (error) {
      return null;
    }
  }, [enabled, isInitialized, activeGroups, amendFlightplan]);
  
  /**
   * Process only new/changed flightplans
   */
  const processNewFlightplans = useCallback(async () => {
    if (!enabled || !isInitialized || state.isProcessing) {
      console.log(`[AutoRouting] processNewFlightplans skipped: enabled=${enabled} isInitialized=${isInitialized} isProcessing=${state.isProcessing}`);
      return;
    }
    
    const newFlightplans = Array.from(flightplansMap.values()).filter(fp => {
      // Already has an adapted block — mark as processed and skip forever
      if ((fp.route || '').includes('+')) {
        processedFlightplans.current.add(fp.aircraftId);
        return false;
      }
      return !processedFlightplans.current.has(fp.aircraftId);
    });
    
    if (newFlightplans.length === 0) {
      console.log(`[AutoRouting] processNewFlightplans: no new flightplans (total=${flightplansMap.size} already-processed=${processedFlightplans.current.size})`);
      return;
    }
    
    console.log(`[AutoRouting] processNewFlightplans: processing ${newFlightplans.length} new flightplan(s):`, newFlightplans.map(fp => fp.aircraftId));
    
    setState(prev => ({ ...prev, isProcessing: true }));
    
    const results: ProcessingResult[] = [];
    
    for (const fp of newFlightplans) {
      const result = await processSingle(fp);
      if (result) {
        results.push(result);
      }
    }
    
    setState(prev => ({
      ...prev,
      isProcessing: false,
      lastProcessedAt: Date.now(),
      stats: prev.stats ? {
        ...prev.stats,
        totalProcessed: prev.stats.totalProcessed + newFlightplans.length,
        amended: prev.stats.amended + results.filter(r => r.success).length,
        results: [...prev.stats.results, ...results]
      } : {
        totalProcessed: newFlightplans.length,
        amended: results.filter(r => r.success).length,
        skipped: newFlightplans.length - results.length,
        errors: results.filter(r => !r.success).length,
        results
      }
    }));
  }, [enabled, isInitialized, state.isProcessing, flightplansMap, processSingle]);
  
  /**
   * Clear processed tracking (allows re-processing)
   */
  const reset = useCallback(() => {
    processedFlightplans.current.clear();
    setState({
      isProcessing: false,
      lastProcessedAt: null,
      stats: null,
      error: null
    });
  }, []);
  
  // Auto-process on flightplan changes
  useEffect(() => {
    if (!processOnChange || !enabled || !isInitialized) {
      return;
    }
    
    // Debounce processing
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      processNewFlightplans();
    }, debounceMs);
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [flightplansMap, processOnChange, enabled, isInitialized, debounceMs, processNewFlightplans]);
  
  return {
    ...state,
    processAll,
    processSingle,
    processNewFlightplans,
    reset,
    isEnabled: enabled && isInitialized
  };
}

/**
 * Hook to check if a flightplan has an applicable adapted route without amending
 */
export function useAdaptedRoutePreview(
  flightplan: ApiFlightplan | null,
  activeGroups: string[] = []
): RouteAmendmentResult | null {
  const [preview, setPreview] = useState<RouteAmendmentResult | null>(null);
  const isInitialized = adaptedRoutingsService.isInitialized();
  
  useEffect(() => {
    if (!flightplan || !isInitialized) {
      setPreview(null);
      return;
    }
    
    findBestRouteForFlightplan(flightplan, activeGroups).then(setPreview);
  }, [flightplan, isInitialized, activeGroups]);
  
  return preview;
}
