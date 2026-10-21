import { useState } from 'react';
import { ChevronRight, FolderPlus, MapPin, Pencil, Trash2 } from 'lucide-react';
import { BenchmarkApi } from '@benchmark/api';
import type { Plan, Site, UserLanguage, WeatherStation } from '@benchmark/domain';
import { t } from '../language';
import { canCreateSite, groupStationsBySite } from './stationSiteRules';
import { DeleteSiteDialog, SiteNameDialog } from './SiteDialogs';
import './stationSites.css';

type Props = {
  api: BenchmarkApi;
  organizationId: string;
  plan: Plan;
  canManage: boolean;
  active: boolean;
  sites: Site[];
  stations: WeatherStation[];
  selectedStationId: string | null;
  siteFilterId: string;
  onSiteFilterChange: (siteId: string) => void;
  onSelectStation: (stationId: string) => void;
  onSiteCreated: (site: Site) => void;
  onSiteUpdated: (site: Site) => void;
  onSiteDeleted: (siteId: string) => void;
  onManageBilling: () => void;
  language: UserLanguage;
  onUnauthorized: () => void;
};

function siteName(site: Site, language: UserLanguage): string {
  return site.name === 'Default Site' ? t('Default Site', language) : site.name;
}

export function StationSites({ api, organizationId, plan, canManage, active, sites, stations,
  selectedStationId, siteFilterId, onSiteFilterChange, onSelectStation, onSiteCreated,
  onSiteUpdated, onSiteDeleted, onManageBilling, language, onUnauthorized }: Props) {
  const [action, setAction] = useState<{ kind: 'create' } | { kind: 'rename' | 'delete'; site: Site } | null>(null);
  const [grouped, setGrouped] = useState(true);
  const [notice, setNotice] = useState<{ label: 'Site created:' | 'Site renamed:' | 'Site deleted:'; name: string } | null>(null);
  const available = canCreateSite(plan, sites.length);
  const filter = sites.some(site => site.id === siteFilterId) ? siteFilterId : '';
  const allGroups = groupStationsBySite(sites, stations);
  const groups = filter ? allGroups.filter(group => group.site?.id === filter) : allGroups;
  const visibleStations = filter ? stations.filter(station => station.siteId === filter) : stations;
  const bySite = new Map(sites.map(site => [site.id, site]));

  function renderStation(station: WeatherStation) {
    const site = bySite.get(station.siteId);
    return <button className={`station-row ${selectedStationId === station.id ? 'selected' : ''}`} type="button"
      key={station.id} aria-expanded={selectedStationId === station.id} onClick={() => onSelectStation(station.id)}>
      <div className="station-icon"><MapPin size={17} /></div>
      <div className="station-row-name"><strong>{station.name}</strong>
        {!grouped && <span className="station-row-site">{site ? siteName(site, language) : t('Site unavailable', language)}</span>}
        <span>{station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}</span>
      </div>
      <div className="station-meta"><span>{station.timeZone}</span><small>{t(station.status, language)}</small></div>
      <ChevronRight className="station-row-chevron" size={17} aria-hidden="true" />
    </button>;
  }

  return <>
    <section className="station-sites-card" aria-labelledby="station-sites-title">
      <div className="station-sites-heading">
        <div><h3 id="station-sites-title">{t('Sites', language)}</h3>
          <p>{t('Group your stations by location, farm, or project.', language)}</p></div>
        {canManage && <button type="button" className="secondary-button" disabled={!active || !available}
          onClick={() => setAction({ kind: 'create' })}><FolderPlus size={16} />{t('Create site', language)}</button>}
      </div>
      {notice !== null && <p className="station-sites-success" role="status">
        {t(notice.label, language)} <strong>{notice.name}</strong>
      </p>}
      {canManage && active && !available && <p className="station-sites-plan">
        {t('FREE includes one site. PRO and PREMIUM allow multiple sites.', language)}{' '}
        <button type="button" className="text-button" onClick={onManageBilling}>{t('Upgrade plan', language)}</button>
      </p>}
      <div className="station-sites-toolbar">
        <label className="field"><span>{t('Filter by site', language)}</span>
          <select value={filter} onChange={event => onSiteFilterChange(event.target.value)}>
            <option value="">{t('All sites', language)} ({stations.length})</option>
            {allGroups.map(({ site, stations: siteStations }) => site && <option key={site.id} value={site.id}>
              {siteName(site, language)} ({siteStations.length})
            </option>)}
          </select>
        </label>
        <label className="station-sites-group-toggle"><input type="checkbox" checked={grouped}
          onChange={event => setGrouped(event.target.checked)} /><span>{t('Group by site', language)}</span></label>
      </div>
      {canManage && sites.length > 0 && <details className="station-site-management">
        <summary>{t('Manage sites', language)}</summary>
        <p>{t('Delete only empty sites. Every organization must keep at least one site.', language)}</p>
        <div role="list" aria-label={t('Site management', language)}>
          {allGroups.map(({ site, stations: siteStations }) => site && <div key={site.id} className="station-site-management-row" role="listitem">
            <div><strong>{siteName(site, language)}</strong><span>{t(siteStations.length === 1 ? '1 station' : '{count} stations', language).replace('{count}', String(siteStations.length))}</span></div>
            <div className="station-site-management-actions">
              <button type="button" className="secondary-button" disabled={!active}
                aria-label={`${t('Rename site', language)}: ${siteName(site, language)}`} onClick={() => setAction({ kind: 'rename', site })}>
                <Pencil size={14} />{t('Rename site', language)}</button>
              <button type="button" className="secondary-button" disabled={!active}
                aria-label={`${t('Delete site', language)}: ${siteName(site, language)}`} onClick={() => setAction({ kind: 'delete', site })}>
                <Trash2 size={14} />{t('Delete site', language)}</button>
            </div>
          </div>)}
        </div>
      </details>}
    </section>

    <div className="station-directory" aria-label={t('Station list', language)}>
      {grouped ? groups.map(group => <section className="station-site-group" key={group.site?.id ?? 'other-stations'}
        aria-label={group.site ? siteName(group.site, language) : t('Other stations', language)}>
        <div className="station-site-group-heading"><h4>{group.site ? siteName(group.site, language) : t('Other stations', language)}</h4>
          <span>{t(group.stations.length === 1 ? '1 station' : '{count} stations', language).replace('{count}', String(group.stations.length))}</span></div>
        {group.stations.length > 0 ? <div className="station-list-card">{group.stations.map(renderStation)}</div>
          : <p className="station-site-empty">{t('No stations in this site yet. Choose this site when adding a station.', language)}</p>}
      </section>) : visibleStations.length > 0
        ? <div className="station-list-card">{visibleStations.map(renderStation)}</div>
        : <p className="station-site-empty">{t('No stations in this site yet. Choose this site when adding a station.', language)}</p>}
    </div>

    {action && action.kind !== 'delete' && canManage && active && (action.kind === 'rename' || available) &&
      <SiteNameDialog key={action.kind === 'rename' ? action.site.id : 'create'} api={api} organizationId={organizationId}
        site={action.kind === 'rename' ? action.site : undefined} language={language} onUnauthorized={onUnauthorized}
        onClose={() => setAction(null)} onSaved={site => {
          if (action.kind === 'create') onSiteCreated(site);
          else onSiteUpdated(site);
          setNotice({ label: action.kind === 'create' ? 'Site created:' : 'Site renamed:', name: site.name });
          setAction(null);
        }} />}
    {action?.kind === 'delete' && canManage && active && <DeleteSiteDialog api={api} organizationId={organizationId}
      site={action.site} siteCount={sites.length} stationCount={stations.filter(station => station.siteId === action.site.id).length}
      language={language} onUnauthorized={onUnauthorized} onClose={() => setAction(null)}
      onShowStations={() => { onSiteFilterChange(action.site.id); setGrouped(true); setAction(null); }}
      onDeleted={siteId => { onSiteDeleted(siteId); setNotice({ label: 'Site deleted:', name: action.site.name }); setAction(null); }} />}
  </>;
}
