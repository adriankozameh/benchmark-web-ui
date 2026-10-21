import type { Plan, Site, WeatherStation } from '@benchmark/domain';

export type StationSiteGroup = {
  site: Site | null;
  stations: WeatherStation[];
};

export function canCreateSite(plan: Plan, siteCount: number): boolean {
  return plan === 'PRO' || plan === 'PREMIUM' || siteCount === 0;
}

export function validateSiteName(name: string): string | null {
  return name.trim().length >= 1 && name.trim().length <= 200
    ? null : 'Enter a site name of 1 to 200 characters.';
}

export function groupStationsBySite(sites: Site[], stations: WeatherStation[]): StationSiteGroup[] {
  const groups = sites.map(site => ({ site, stations: [] as WeatherStation[] }));
  const bySite = new Map(groups.map(group => [group.site.id, group]));
  const other: StationSiteGroup = { site: null, stations: [] };
  for (const station of stations) {
    (bySite.get(station.siteId) ?? other).stations.push(station);
  }
  // A stale site list must never make a station disappear from the directory.
  return other.stations.length ? [...groups, other] : groups;
}
