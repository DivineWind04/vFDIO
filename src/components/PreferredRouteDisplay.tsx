/**
 * PreferredRouteDisplay Component
 * Displays adapted departure/arrival routes for selected flightplan (display only)
 * Ported from EDST PreferredRouteDisplay.tsx
 * 
 * Note: Route amendments are handled automatically via useAutoAdaptedRouting hook
 */

import React from "react";
import type { ApiFlightplan } from "../types/apiTypes/apiFlightplan";
import type { EdstAdaptedRoute } from "../types/adaptedRouting";
import { useRouteDisplay } from "../hooks/useAdaptedRouting";
import { useDispatch, useSelector } from "react-redux";
import { setShowEligibleOnly, selectShowEligibleOnly } from "../redux/slices/adaptedRoutingSlice";
import type { AppDispatch } from "../redux/store";

type PreferredRouteDisplayProps = {
  flightplan: ApiFlightplan | null;
  className?: string;
};

export const PreferredRouteDisplay: React.FC<PreferredRouteDisplayProps> = ({
  flightplan,
  className = "",
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const showEligibleOnly = useSelector(selectShowEligibleOnly);
  const { routes, eligibleRoutes, loading, isInitialized } = useRouteDisplay(flightplan);

  const displayRoutes = showEligibleOnly ? eligibleRoutes : routes;

  const handleToggleEligible = (eligibleOnly: boolean) => {
    dispatch(setShowEligibleOnly(eligibleOnly));
  };

  /**
   * Format route display text based on route type
   */
  const formatRouteDisplay = (route: EdstAdaptedRoute): string => {
    if (route.routeType === "adar") {
      return `${route.departure}${route.route}${route.destination}`;
    } else if (route.routeType === "adr") {
      return `${route.departure}${route.amendment}`;
    } else {
      return `${route.amendment}${route.destination}`;
    }
  };

  /**
   * Get route type label for display
   */
  const getRouteTypeLabel = (route: EdstAdaptedRoute): string => {
    switch (route.routeType) {
      case "adar":
        return "ADAR";
      case "adr":
        return "ADR";
      case "aar":
        return "AAR";
      default:
        return "";
    }
  };

  if (!flightplan) {
    return (
      <div className={`bg-black border border-fdio-green p-2 ${className}`}>
        <div className="text-fdio-green text-sm">No flightplan selected</div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className={`bg-black border border-fdio-green p-2 ${className}`}>
        <div className="text-fdio-green text-sm">Adapted routing not initialized</div>
      </div>
    );
  }

  return (
    <div className={`bg-black border border-fdio-green ${className}`}>
      {/* Header with toggle */}
      <div className="flex gap-2 p-2 border-b border-fdio-green">
        <span
          className={`px-2 py-0.5 text-xs cursor-pointer ${
            showEligibleOnly ? "text-fdio-green underline" : "text-fdio-green/60"
          }`}
          onClick={() => handleToggleEligible(true)}
        >
          ELIGIBLE
        </span>
        <span className="text-fdio-green/60">|</span>
        <span
          className={`px-2 py-0.5 text-xs cursor-pointer ${
            !showEligibleOnly ? "text-fdio-green underline" : "text-fdio-green/60"
          }`}
          onClick={() => handleToggleEligible(false)}
        >
          ALL
        </span>
        <span className="ml-auto text-fdio-green text-xs">
          {flightplan.aircraftId} | {flightplan.departure}-{flightplan.destination}
        </span>
      </div>

      {/* Route list */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-2 text-fdio-green text-sm">Loading routes...</div>
        ) : displayRoutes.length === 0 ? (
          <div className="p-2 text-fdio-green text-sm">
            {showEligibleOnly
              ? "No Eligible APRs: Select ALL to display Ineligible APRs"
              : "No adapted routes found"}
          </div>
        ) : (
          displayRoutes.map((route, index) => (
            <div
              key={`${route.routeType}-${index}`}
              className="p-2 border-b border-fdio-green/30"
            >
              <div className="flex items-start gap-2">
                {/* Route type badge */}
                <span
                  className={`text-xs px-1.5 py-0.5 border ${
                    route.routeType === "adar"
                      ? "border-yellow-400 text-yellow-400"
                      : route.routeType === "adr"
                      ? "border-cyan-400 text-cyan-400"
                      : "border-purple-400 text-purple-400"
                  }`}
                >
                  {getRouteTypeLabel(route)}
                </span>

                {/* Route text */}
                <span className="text-fdio-green text-sm font-mono flex-1">
                  {formatRouteDisplay(route)}
                </span>

                {/* Eligibility indicator */}
                {!route.eligible && (
                  <span className="text-red-500 text-xs">INELIGIBLE</span>
                )}

                {/* RNAV required indicator */}
                {route.rnavRequired && (
                  <span className="text-yellow-400 text-xs">RNAV</span>
                )}
              </div>

              {/* Triggered fix for ADR/AAR */}
              {(route.routeType === "adr" || route.routeType === "aar") &&
                route.triggeredFix && (
                  <div className="text-fdio-green/60 text-xs mt-1 ml-10">
                    TFix: {route.triggeredFix}
                  </div>
                )}
            </div>
          ))
        )}
      </div>

      {/* Footer with route count */}
      <div className="flex justify-between p-2 border-t border-fdio-green text-xs text-fdio-green/60">
        <span>
          {displayRoutes.length} route{displayRoutes.length !== 1 ? "s" : ""}{" "}
          {showEligibleOnly ? "(eligible)" : "(all)"}
        </span>
        <span>
          ADAR: {routes.filter((r) => r.routeType === "adar").length} |{" "}
          ADR: {routes.filter((r) => r.routeType === "adr").length} |{" "}
          AAR: {routes.filter((r) => r.routeType === "aar").length}
        </span>
      </div>
    </div>
  );
};

export default PreferredRouteDisplay;
