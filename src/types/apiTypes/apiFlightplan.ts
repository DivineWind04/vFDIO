import type { HoldAnnotations } from "../hold/holdAnnotations";
import type { Nullable } from "../utility-types";

export type ApiFlightplan = {
  aircraftId: string;
  cid: string;
  status: "Proposed" | "Active" | "Tentative";
  assignedBeaconCode: Nullable<number>;
  equipment: string;
  aircraftType: string;
  icaoEquipmentCodes: string;
  icaoSurveillanceCodes: string;
  faaEquipmentSuffix: string;
  speed: number;
  altitude: string;
  departure: string;
  destination: string;
  alternate: string;
  route: string;
  estimatedDepartureTime: number;
  actualDepartureTime: number;
  fuelHours: number;
  fuelMinutes: number;
  hoursEnroute: number;
  minutesEnroute: number;
  pilotCid: string;
  remarks: string;
  holdAnnotations: null;
  wakeTurbulenceCode: string;
};

type CreateOrAmendFlightplanDtoKeys =
  | "aircraftId"
  | "cid"
  | "status"
  | "assignedBeaconCode"
  | "equipment"
  | "aircraftType"
  | "icaoEquipmentCodes"
  | "icaoSurveillanceCodes"
  | "faaEquipmentSuffix"
  | "speed"
  | "altitude"
  | "departure"
  | "destination"
  | "alternate"
  | "route"
  | "estimatedDepartureTime"
  | "actualDepartureTime"
  | "fuelHours"
  | "fuelMinutes"
  | "hoursEnroute"
  | "minutesEnroute"
  | "pilotCid"
  | "remarks"
  | "holdAnnotations"
  | "wakeTurbulenceCode";

export type CreateOrAmendFlightplanDto = Pick<ApiFlightplan, CreateOrAmendFlightplanDtoKeys>;
