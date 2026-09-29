export type ExplorerManifest = { coreFile: string; metadataFile: string };
export type ExplorerStation = { id: string; name: string; lat: number; lon: number; elevation: number | null; active: number };
export type ExplorerDetails = { stationId: string; state: string; elevation: number | null; minYear: number; maxYear: number;
  variables: { id: string; startYear: number; endYear: number; lengthYears: number; downloadable: boolean }[] };
