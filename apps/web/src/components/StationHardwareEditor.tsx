import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, MapPin } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { DataProvider, Plan, ProviderCredentials, Site, UserLanguage, WeatherStation } from '@benchmark/domain';
import { AddressSearch } from './AddressSearch';
import { MapPicker } from './MapPicker';
import { errorMessage, t } from '../language';

const HARDWARE_PROVIDERS = [
  ['WEATHER_LINK', 'WeatherLink'], ['AMBIENT_WEATHER', 'Ambient Weather'],
  ['TEMPEST', 'Tempest'], ['VAISALA', 'Vaisala'], ['SENSECAP_GLOBAL', 'SenseCAP Global'],
  ['SENSECAP_CHINA', 'SenseCAP China'], ['METOS', 'METOS'], ['METER', 'METER'],
  ['FAWN', 'FAWN'], ['CIMIS', 'CIMIS'], ['ACUITY', 'Acuity'],
  ['LICOR_HOBO', 'LI-COR / HOBO'], ['ZEUS', 'Zeus'], ['RANCH_SYSTEM', 'Ranch System'],
] as const;

type CredentialField = keyof ProviderCredentials;
const CREDENTIAL_FIELDS: { key: CredentialField; label: string; flag: keyof DataProvider }[] = [
  { key: 'apiKey', label: 'API key', flag: 'apiKeyConfigured' },
  { key: 'apiKeySecret', label: 'API key secret', flag: 'apiKeySecretConfigured' },
  { key: 'username', label: 'Username', flag: 'usernameConfigured' },
  { key: 'password', label: 'Password', flag: 'passwordConfigured' },
  { key: 'token', label: 'Access token', flag: 'tokenConfigured' },
];

const REQUIRED_CREDENTIALS: Record<string, CredentialField[]> = {
  WEATHER_LINK: ['apiKey', 'apiKeySecret'], AMBIENT_WEATHER: ['apiKey'],
  VAISALA: ['apiKey'], SENSECAP_GLOBAL: ['apiKey', 'apiKeySecret'],
  SENSECAP_CHINA: ['apiKey', 'apiKeySecret'], METOS: ['apiKey', 'apiKeySecret'],
  METER: ['token'], CIMIS: ['apiKey'], ACUITY: ['token'],
  ZEUS: ['username', 'password'], RANCH_SYSTEM: ['username', 'password'],
};

const emptyCredentials = (): Record<CredentialField, string> => ({
  apiKey: '', apiKeySecret: '', username: '', password: '', token: '',
});

function includesCredentialKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(includesCredentialKeys);
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    /api.?key|secret|password|token|credential/i.test(key) || includesCredentialKeys(child));
}

export function StationHardwareEditor({ api, organizationId, station, sites, language, onChanged, onUnauthorized, plan, onLocationChanged }: {
  api: BenchmarkApi;
  organizationId: string;
  station: WeatherStation;
  sites: Site[];
  language: UserLanguage;
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
  plan: Plan;
  onLocationChanged: (stationId: string) => void;
}) {
  const canChangeLocation = plan === 'PRO' || plan === 'PREMIUM';
  const canConfigureHardware = plan === 'PREMIUM';
  const [name, setName] = useState(station.name);
  const [siteId, setSiteId] = useState(station.siteId);
  const [latitude, setLatitude] = useState(String(station.latitude));
  const [longitude, setLongitude] = useState(String(station.longitude));
  const [metadata, setMetadata] = useState(JSON.stringify(station.metadata ?? {}, null, 2));
  const [providers, setProviders] = useState<DataProvider[]>([]);
  const [providerChoice, setProviderChoice] = useState(station.dataProviderId ?? '');
  const [providerName, setProviderName] = useState('');
  const [providerType, setProviderType] = useState<string>(HARDWARE_PROVIDERS[0][0]);
  const [providerStationId, setProviderStationId] = useState(station.providerStationId ?? '');
  const [region, setRegion] = useState('');
  const [credentials, setCredentials] = useState(emptyCredentials);
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
    setMetadata(JSON.stringify(station.metadata ?? {}, null, 2));
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
        setRegion((current) => current || items.find((item) => item.id === station.dataProviderId)?.region || '');
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
    setRegion(providers.find((item) => item.id === value)?.region ?? '');
    setCredentials(emptyCredentials());
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
    let parsed: Record<string, unknown> | undefined;
    if (canConfigureHardware) {
      try { parsed = JSON.parse(metadata) as Record<string, unknown>; } catch {
        setError(t('Station metadata must be valid JSON.', language));
        return;
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError(t('Station metadata must be a JSON object.', language));
        return;
      }
      if (includesCredentialKeys(parsed)) {
        setError(t('Keep credentials in provider fields, not station metadata.', language));
        return;
      }
    }
    setSaving(true);
    try {
      await api.updateStation(organizationId, station.id, {
        name: name.trim(), siteId,
        ...(canChangeLocation ? { latitude: lat, longitude: lon } : {}),
        ...(canConfigureHardware ? { metadata: parsed } : {}),
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
    if (providerChoice === 'NEW' && !providerName.trim()) {
      setError(t('Enter a name for the provider account.', language));
      return;
    }
    if (!providerChoice) {
      setError(t('Choose a provider account or create one.', language));
      return;
    }
    if (providerChoice !== 'NEW' && !selectedProvider) {
      setError(t('The selected provider account is no longer available.', language));
      return;
    }
    const type = providerChoice === 'NEW' ? providerType : selectedProvider?.provider ?? '';
    const hasCredential = (key: CredentialField) => !!credentials[key].trim() ||
      !!(selectedProvider && selectedProvider[CREDENTIAL_FIELDS.find((field) => field.key === key)!.flag]);
    const missing = (REQUIRED_CREDENTIALS[type] ?? []).find((key) => !hasCredential(key));
    if (missing) {
      setError(`${t('Missing required credential:', language)} ${t(CREDENTIAL_FIELDS.find((field) => field.key === missing)!.label, language)}`);
      return;
    }
    if (['TEMPEST', 'LICOR_HOBO'].includes(type) && !hasCredential('token') && !hasCredential('apiKey')) {
      setError(t('An access token or API key is required for this provider.', language));
      return;
    }

    setSaving(true);
    let created = false;
    try {
      const suppliedCredentials = Object.fromEntries(
        Object.entries(credentials).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]),
      ) as ProviderCredentials;
      let dataProviderId = providerChoice;
      if (providerChoice === 'NEW') {
        const provider = await api.createDataProvider(organizationId, {
          name: providerName.trim(), provider: providerType, region: region.trim() || undefined,
          ...suppliedCredentials,
        });
        created = true;
        dataProviderId = provider.id;
        setProviders((current) => [...current, provider]);
        setProviderChoice(provider.id);
        setCredentials(emptyCredentials());
      } else if (selectedProvider && (Object.keys(suppliedCredentials).length > 0 ||
          (region.trim() !== '' && region.trim() !== (selectedProvider.region ?? '')))) {
        const updated = await api.updateDataProvider(organizationId, selectedProvider.id, {
          ...suppliedCredentials,
          ...(region.trim() !== '' && region.trim() !== (selectedProvider.region ?? '') ? { region: region.trim() } : {}),
        });
        setProviders((current) => current.map((item) => item.id === updated.id ? updated : item));
        setCredentials(emptyCredentials());
      }
      await api.linkStationDataProvider(organizationId, station.id, dataProviderId, providerStationId.trim());
      await onChanged();
      setSaved(true);
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else if (created) setError(t('Provider account saved, but linking the station failed. Try saving the connection again.', language));
      else handleError(cause);
    } finally { setSaving(false); }
  }

  async function disconnect() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.unlinkStationDataProvider(organizationId, station.id);
      setProviderChoice('');
      setProviderStationId('');
      setCredentials(emptyCredentials());
      await onChanged();
      setSaved(true);
    } catch (cause) { handleError(cause); }
    finally { setSaving(false); }
  }

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
      {canConfigureHardware && <label className="field"><span>{t('Additional station metadata (JSON)', language)}</span>
        <textarea spellCheck={false} rows={4} value={metadata} onChange={(event) => setMetadata(event.target.value)} />
        <small>{t('For hardware fields such as STATION_TYPE. Never put API keys or passwords here.', language)}</small>
      </label>}
      <button className="primary-button" type="submit" disabled={saving}>
        {saving ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}{t('Save station details', language)}
      </button>
    </form>

    {!canConfigureHardware && <p className="station-details-hint station-hardware-upgrade">
      {t('Weather station hardware setup is available on the PREMIUM plan.', language)}
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
              <option value="NEW">{t('Create a new provider account', language)}</option>
            </select>
          </label>
          {providerChoice && <label className="field"><span>{t('Hardware station ID', language)}</span>
            <input value={providerStationId} maxLength={255} onChange={(event) => setProviderStationId(event.target.value)} required
              placeholder={t('Device ID, station ID, or MAC address', language)} />
          </label>}
        </div>
        {providerChoice === 'NEW' && <div className="station-details-grid">
          <label className="field"><span>{t('Provider account name', language)}</span>
            <input value={providerName} maxLength={200} onChange={(event) => setProviderName(event.target.value)} required
              placeholder={t('e.g. Farm weather stations', language)} />
          </label>
          <label className="field"><span>{t('Hardware provider', language)}</span><select value={providerType} onChange={(event) => setProviderType(event.target.value)}>
            {HARDWARE_PROVIDERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
        </div>}
        {providerChoice && <>
          {selectedProvider && <p className="station-details-hint">{t('Credentials already saved:', language)}{' '}
            {CREDENTIAL_FIELDS.filter(({ flag }) => selectedProvider[flag]).map(({ label }) => t(label, language)).join(', ') || t('None', language)}.
            {' '}{t('Leave credential fields blank to keep saved values.', language)}
          </p>}
          <div className="station-details-grid">
            {CREDENTIAL_FIELDS.map(({ key, label }) => <label key={key} className="field">
              <span>{t(label, language)}</span>
              <input type="password" autoComplete="new-password" value={credentials[key]}
                onChange={(event) => setCredentials((current) => ({ ...current, [key]: event.target.value }))} />
            </label>)}
            <label className="field"><span>{t('Region', language)}</span>
              <input value={region} maxLength={200} onChange={(event) => setRegion(event.target.value)} />
            </label>
          </div>
          {selectedProvider && <p className="station-details-hint">{t('Changing saved credentials affects every station using this provider account.', language)}</p>}
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
  </section>;
}
