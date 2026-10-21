import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronRight, CircleAlert, FolderPlus, LoaderCircle, MapPin } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { Plan, Site, UserLanguage, WeatherStation } from '@benchmark/domain';
import { errorMessage, t } from '../language';
import { canCreateSite, groupStationsBySite, validateSiteName } from './stationSiteRules';
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
  onManageBilling: () => void;
  language: UserLanguage;
  onUnauthorized: () => void;
};

function siteName(site: Site, language: UserLanguage): string {
  return site.name === 'Default Site' ? t('Default Site', language) : site.name;
}

export function StationSites({ api, organizationId, plan, canManage, active, sites, stations,
  selectedStationId, siteFilterId, onSiteFilterChange, onSelectStation, onSiteCreated,
  onManageBilling, language, onUnauthorized }: Props) {
  const [creating, setCreating] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [createdName, setCreatedName] = useState<string | null>(null);
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
          onClick={() => setCreating(true)}><FolderPlus size={16} />{t('Create site', language)}</button>}
      </div>
      {createdName !== null && <p className="station-sites-success" role="status">
        {t('Site created:', language)} <strong>{createdName}</strong>
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

    {creating && canManage && active && available && <CreateSiteDialog api={api} organizationId={organizationId}
      language={language} onUnauthorized={onUnauthorized} onClose={() => setCreating(false)}
      onCreated={site => { onSiteCreated(site); setCreatedName(site.name); setCreating(false); }} />}
  </>;
}

function CreateSiteDialog({ api, organizationId, language, onUnauthorized, onClose, onCreated }: {
  api: BenchmarkApi;
  organizationId: string;
  language: UserLanguage;
  onUnauthorized: () => void;
  onClose: () => void;
  onCreated: (site: Site) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => { mounted.current = false; element?.close(); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const invalid = validateSiteName(name);
    setValidation(invalid);
    if (invalid) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const site = await api.createSite(organizationId, { name: name.trim() });
      if (mounted.current) onCreated(site);
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(cause);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <dialog ref={dialog} className="station-delete-dialog station-site-dialog"
    aria-labelledby="create-site-title" aria-describedby="create-site-description"
    onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose(); }}>
    <form onSubmit={event => { void submit(event); }}>
      <h2 id="create-site-title">{t('Create site', language)}</h2>
      <p id="create-site-description">{t('Sites organize your stations. Creating a site does not add station capacity.', language)}</p>
      <fieldset disabled={saving}>
        <label className="field"><span>{t('Site name', language)}</span>
          <input autoFocus required maxLength={200} value={name} aria-invalid={validation ? true : undefined}
            aria-describedby={validation ? 'create-site-name-error' : undefined}
            onChange={event => { setName(event.target.value); setValidation(null); }}
            placeholder={t('e.g. North Farm', language)} />
          {validation && <small id="create-site-name-error" className="field-error" role="alert">{t(validation, language)}</small>}
        </label>
        {error !== null && <div className="alert error" role="alert"><CircleAlert size={17} /><span>{errorMessage(error, language)}</span></div>}
        <div className="station-details-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{t('Cancel', language)}</button>
          <button type="submit" className="primary-button">{saving ? <LoaderCircle className="spin" size={16} /> : <FolderPlus size={16} />}
            {t(saving ? 'Creating site…' : 'Create site', language)}</button>
        </div>
      </fieldset>
    </form>
  </dialog>;
}
