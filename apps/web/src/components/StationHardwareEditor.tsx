import { FormEvent, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, MapPin, Trash2 } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { DataProvider, Plan, Site, UserLanguage, WeatherStation } from '@benchmark/domain';
import { AddressSearch } from './AddressSearch';
import { MapPicker } from './MapPicker';
import { errorMessage, t } from '../language';

export function StationHardwareEditor({ api, organizationId, station, sites, language, onChanged, onUnauthorized, plan, onLocationChanged, canManageProviders, onManageProviders }: {
  api: BenchmarkApi;
  organizationId: string;
  station: WeatherStation;
  sites: Site[];
  language: UserLanguage;
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
  plan: Plan;
  canManageProviders: boolean;
  onManageProviders: () => void;
  onLocationChanged: (stationId: string) => void;
}) {
  const canChangeLocation = plan === 'PRO' || plan === 'PREMIUM';
  const canDeleteStation = canChangeLocation && canManageProviders;
  const deleting = useRef(false);
  const [deleted, setDeleted] = useState(false);
  const canConfigureHardware = plan === 'PREMIUM' && canManageProviders;
  const [name, setName] = useState(station.name);
  const [siteId, setSiteId] = useState(station.siteId);
  const [latitude, setLatitude] = useState(String(station.latitude));
  const [longitude, setLongitude] = useState(String(station.longitude));
  const [providers, setProviders] = useState<DataProvider[]>([]);
  const [providerChoice, setProviderChoice] = useState(station.dataProviderId ?? '');
  const [providerStationId, setProviderStationId] = useState(station.providerStationId ?? '');
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const mapLatitude = latitude.trim() !== '' && Number(latitude) >= -90 && Number(latitude) <= 90
    ? Number(latitude) : null;
  const mapLongitude = longitude.trim() !== '' && Number(longitude) >= -180 && Number(longitude) <= 180
    ? Number(longitude) : null;

  useEffect(() => {
    setName(station.name);
    setSiteId(station.siteId);
    setLatitude(String(station.latitude));
    setLongitude(String(station.longitude));
    setProviderChoice(station.dataProviderId ?? '');
    setProviderStationId(station.providerStationId ?? '');
  }, [station.id, station.updatedAt]);

  useEffect(() => {
    if (!canConfigureHardware) {
      setLoadingProviders(false);
      return;
    }
    let active = true;
    setLoadingProviders(true);
    setProviderError(null);
    void api.listDataProviders(organizationId).then((items) => {
      if (active) {
        setProviders(items);
      }
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof BenchmarkApiError && cause.status === 403)
        setProviderError(t('Observation provider access is unavailable for this account.', language));
      else setProviderError(errorMessage(cause, language));
    }).finally(() => { if (active) setLoadingProviders(false); });
    return () => { active = false; };
  }, [api, organizationId, station.dataProviderId, language, onUnauthorized, canConfigureHardware]);

  const selectedProvider = providers.find((item) => item.id === providerChoice);
  const configuredProvider = providers.find((item) => item.id === station.dataProviderId);

  function selectProvider(value: string) {
    setProviderChoice(value);
    setSaved(false);
    setError(null);
  }

  function handleError(cause: unknown) {
    if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
    else setError(errorMessage(cause, language));
  }

  async function saveStation(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!name.trim() || !latitude.trim() || !longitude.trim() ||
        !Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setError(t('Enter a station name and valid coordinates.', language));
      return;
    }
    setSaving(true);
    try {
      await api.updateStation(organizationId, station.id, {
        name: name.trim(), siteId,
        ...(canChangeLocation ? { latitude: lat, longitude: lon } : {}),
      });
      await onChanged();
      if (canChangeLocation && (lat !== station.latitude || lon !== station.longitude)) {
        onLocationChanged(station.id);
      } else {
        setSaved(true);
      }
    } catch (cause) { handleError(cause); }
    finally { setSaving(false); }
  }

  async function saveHardware(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (!providerStationId.trim() || providerStationId.trim().length > 255) {
      setError(t('Enter a valid hardware station ID (up to 255 characters).', language));
      return;
    }
    if (!selectedProvider) {
      setError(t('Select a provider account', language));
      return;
    }
    setSaving(true);
    try {
      await api.linkStationDataProvider(organizationId, station.id, selectedProvider.id, providerStationId.trim());
      await onChanged();
      setSaved(true);
    } catch (cause) { handleError(cause); }
    finally { setSaving(false); }
  }

  async function deleteStation() {
    if (!canDeleteStation || saving || deleting.current || deleted) return;
    const confirmed = window.confirm(`${t('Delete station', language)}: ${station.name}?\n\n${t('This permanently removes the station from your organization. Its provider account will be kept. This cannot be undone.', language)}`);
    if (!confirmed) return;
    deleting.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.deleteStation(organizationId, station.id);
      setDeleted(true);
      await onChanged();
    } catch (cause) { handleError(cause); }
    finally { deleting.current = false; setSaving(false); }
  }

  async function disconnect() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.unlinkStationDataProvider(organizationId, station.id);
      setProviderChoice('');
      setProviderStationId('');
      await onChanged();
      setSaved(true);
    } catch (cause) { handleError(cause); }
    finally { setSaving(false); }
  }

  if (deleted) return <section className="station-form-card" role="status">
    <p>{t('Station deleted.', language)}</p>
    {error && <p role="alert">{error}</p>}
    <button className="secondary-button" type="button" disabled={saving}
      onClick={() => void onChanged().catch(handleError)}>{t('Refresh', language)}</button>
  </section>;

  return <section className="station-form-card station-details" aria-label={t('Station details', language)}>
    <div className="form-card-heading">
      <div><span className="eyebrow">{t('Station details', language)}</span><h3>{station.name}</h3></div>
      <span className="station-details-status">{t(station.status, language)}</span>
    </div>
    {error && <div className="alert error compact" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
    {saved && <div className="alert neutral compact" role="status"><CheckCircle2 size={17} /><span>{t('Saved', language)}</span></div>}
    <form className="station-details-section" onSubmit={(event) => void saveStation(event)}>
      <h4>{t('Station location', language)}</h4>
      <div className="station-details-grid">
        <label className="field"><span>{t('Station name', language)}</span><input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="field"><span>{t('Site', language)}</span><select value={siteId} onChange={(event) => setSiteId(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{t(site.name, language)}</option>)}</select></label>
        <label className="field"><span>{t('Latitude', language)}</span><input type="number" step="any" min={-90} max={90} value={latitude} onChange={(event) => setLatitude(event.target.value)} required disabled={!canChangeLocation} /></label>
        <label className="field"><span>{t('Longitude', language)}</span><input type="number" step="any" min={-180} max={180} value={longitude} onChange={(event) => setLongitude(event.target.value)} required disabled={!canChangeLocation} /></label>
      </div>
      {canChangeLocation && <>
        <div className="field">
          <span>{t('Find location', language)}</span>
          <AddressSearch language={language} onSelect={(location) => {
            setLatitude(location.latitude.toFixed(6));
            setLongitude(location.longitude.toFixed(6));
          }} />
          <small>{t('Search, enter coordinates, or click the map.', language)}</small>
        </div>
        <div className="station-details-map">
          <MapPicker latitude={mapLatitude} longitude={mapLongitude} language={language}
            onChange={(nextLatitude, nextLongitude) => {
              setLatitude(nextLatitude.toFixed(6));
              setLongitude(nextLongitude.toFixed(6));
            }} />
          <div className="map-caption"><MapPin size={15} /> {t('Click or drag the pin to place the station.', language)}</div>
        </div>
      </>}
      <p className="station-details-hint">{canChangeLocation
        ? t('Time zone is calculated from the station coordinates.', language)
        : t('Location is fixed on the FREE plan. Upgrade to PRO or PREMIUM to change it.', language)} {station.timeZone}</p>
      <button className="primary-button" type="submit" disabled={saving}>
        {saving ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}{t('Save station details', language)}
      </button>
    </form>

    {!canConfigureHardware && <p className="station-details-hint station-hardware-upgrade">
      {t(plan !== 'PREMIUM' ? 'Weather station hardware setup is available on the PREMIUM plan.' : 'Only organization Owners and Admins can manage provider accounts.', language)}
    </p>}
    {canConfigureHardware && <form className="station-details-section" onSubmit={(event) => void saveHardware(event)}>
      <h4>{t('Weather station hardware', language)}</h4>
      <p className="station-details-hint">{t('Provider accounts can be reused by multiple stations. Each station has its own hardware ID.', language)}</p>
      {loadingProviders && <p>{t('Loading provider accounts…', language)}</p>}
      {providerError && <div className="alert neutral compact" role="status"><CircleAlert size={17} /><span>{providerError}</span></div>}
      {!loadingProviders && !providerError && <>
        <div className="station-details-grid">
          <label className="field"><span>{t('Provider account', language)}</span>
            <select value={providerChoice} onChange={(event) => selectProvider(event.target.value)}>
              <option value="">{t('Select a provider account', language)}</option>
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} ({provider.provider})</option>)}
            </select>
          </label>
          {providerChoice && <label className="field"><span>{t('Hardware station ID', language)}</span>
            <input value={providerStationId} maxLength={255} onChange={(event) => setProviderStationId(event.target.value)} required
              placeholder={t('Device ID, station ID, or MAC address', language)} />
          </label>}
        </div>
        <button className="text-button" type="button" onClick={onManageProviders}>{t('Manage provider accounts', language)}</button>
        {providers.length === 0 && <p>{t('Add a provider in Data Providers before linking this station.', language)}</p>}
        {providerChoice && <>
          <div className="station-details-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}{t('Save hardware connection', language)}
            </button>
            {station.dataProviderId && <button type="button" className="text-button" disabled={saving} onClick={() => void disconnect()}>
              {t('Disconnect hardware', language)}
            </button>}
          </div>
        </>}
        {!providerChoice && configuredProvider && <p className="station-details-hint">{t('Currently connected to:', language)} {configuredProvider.name}</p>}
      </>}
    </form>}
    {canDeleteStation && <div className="station-details-section">
      <button type="button" className="secondary-button" disabled={saving}
        onClick={() => void deleteStation()}>
        <Trash2 size={17} aria-hidden="true" />{t('Delete station', language)}
      </button>
    </div>}
  </section>;
}
