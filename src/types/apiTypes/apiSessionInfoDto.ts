export interface ApiSessionInfoDto {
  id: string;
  artccId: string;
  isActive?: boolean;
  isPseudoController: boolean;
  callsign?: string;
  role?: string;
  positions: Array<{
    isPrimary: boolean;
    facilityId: string;
    position: {
      id: string;
      callsign: string;
      name: string;
      radioName: string;
      frequency: number;
      starred: boolean;
      eramConfiguration: {
        sectorId: string;
      } | null;
      starsConfiguration: any | null;
    };
  }>;
}
