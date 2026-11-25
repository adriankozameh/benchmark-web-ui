const LABELS: Record<string, string> = {
  NOAA_GFS: 'NOAA GFS', WCS_ECMWF: 'ECMWF', WCS_GEFS: 'GEFS', WCS_ERA5: 'ERA5',
};

export function providerLabel(provider: string): string {
  return LABELS[provider] ?? provider.replaceAll('_', ' ');
}
