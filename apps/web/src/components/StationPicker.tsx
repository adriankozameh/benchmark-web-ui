import { useMemo } from 'react';
import type { Site, UserLanguage, WeatherStation } from '@benchmark/domain';
import { t } from '../language';

export const ALL_SITES = '';

export type SiteFilterProps = {
  sites: Site[];
  siteId: string;
  onSiteChange: (siteId: string) => void;
};

export type SiteStations = {
  activeSiteId: string;
  visibleStations: WeatherStation[];
};

/** Resolves the effective site filter; falls back to all sites if it no longer contains the selected station. */
export function useSiteStations(stations: WeatherStation[], siteId: string, stationId: string): SiteStations {
  const activeSiteId = stations.some((station) => station.id === stationId && station.siteId === siteId)
    ? siteId : ALL_SITES;
  const visibleStations = useMemo(
    () => activeSiteId ? stations.filter((station) => station.siteId === activeSiteId) : stations,
    [stations, activeSiteId],
  );
  return { activeSiteId, visibleStations };
}

function siteName(site: Site, language: UserLanguage): string {
  return site.name === 'Default Site' ? t('Default Site', language) : site.name;
}

type StationPickerProps = SiteStations & {
  sites: Site[];
  stations: WeatherStation[];
  stationId: string;
  language: UserLanguage;
  onSiteChange: (siteId: string) => void;
  onStationChange: (stationId: string) => void;
};

export function StationPicker({
  sites, stations, activeSiteId, visibleStations, stationId, language, onSiteChange, onStationChange,
}: StationPickerProps) {
  const populatedSites = useMemo(
    () => sites.filter((site) => stations.some((station) => station.siteId === site.id)),
    [sites, stations],
  );

  return (
    <div className="station-picker">
      <label className="field">
        <span>{t('Site', language)}</span>
        <select value={activeSiteId} onChange={(event) => onSiteChange(event.target.value)}>
          <option value={ALL_SITES}>{t('All sites', language)}</option>
          {populatedSites.map((site) => <option key={site.id} value={site.id}>{siteName(site, language)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t('Station', language)}</span>
        <select value={stationId} onChange={(event) => onStationChange(event.target.value)}>
          {visibleStations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
        </select>
      </label>
    </div>
  );
}
