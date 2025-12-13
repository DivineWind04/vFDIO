export class ApiTopic {
  constructor(
    public category: string,
    public facilityId: string,
    public subset: number | null = null,
    public sectorId: string | null = null
  ) {}
}