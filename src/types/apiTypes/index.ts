export type { ApiFlightplan, CreateOrAmendFlightplanDto } from './apiFlightplan';

export interface EramTrackDto {
  id: string;
  callsign: string;
  // Add other track properties as needed
}

export interface ApiAircraftTrack {
  id: string;
  callsign: string;
  // Add other aircraft track properties as needed
}

export interface OpenPositionDto {
  id: string;
  name: string;
  // Add other position properties as needed
}
