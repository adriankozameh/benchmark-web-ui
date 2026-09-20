import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  Database,
  ExternalLink,
  Link2,
  LoaderCircle,
  MapPin,
  Plus,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AddressSearch } from './components/AddressSearch';
import { AppShell } from './components/AppShell';
import { BrandLogo } from './components/BrandLogo';
import { MapPicker } from './components/MapPicker';
import { BenchmarkApi, BenchmarkApiError } from './api/benchmarkApi';
import { clearSession, loadSession, saveSession } from './lib/session';
import type {
  CurrentUser,
  DataProvider,
  LocalSession,
  Plan,
  Site,
  StationDataProvider,
  WeatherStation,
} from './types';

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const PROVIDERS = ['WEATHER_LINK', 'AMBIENT_WEATHER', 'TEMPEST', 'VAISALA', 'FAWN'];

type Step = 0 | 1 | 2 | 3;

type LoadState = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const [session, setSession] = useState<LocalSession | null>(() => loadSession());
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [stations, setStations] = useState<WeatherStation[]>([]);
  const [providers, setProviders] = useState<DataProvider[]>([]);
  const [stationProvider, setStationProvider] = useState<StationDataProvider | null>(null);
  const [step, setStep] = useState<Step>(() => (loadSession() ? 1 : 0));
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(() => new BenchmarkApi(session?.apiBaseUrl || DEFAULT_API_BASE_URL), [session]);
  const organization = me?.organizations.find((item) => item.id === session?.organizationId) ?? null;

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoadState('loading');
    setError(null);
    try {
      const nextMe = await api.getMe(session);
      const [nextSites, nextStations] = await Promise.all([
        api.listSites(session),
        api.listStations(session),
      ]);
      setMe(nextMe);
      setSites(nextSites);
      setStations(nextStations);

      const currentOrg = nextMe.organizations.find((item) => item.id === session.organizationId);
      const observationsEnabled = currentOrg?.plan === 'PRO' || currentOrg?.plan === 'PREMIUM';
      if (observationsEnabled) {
        const nextProviders = await api.listDataProviders(session);
        setProviders(nextProviders);
        if (nextStations[0]) {
          setStationProvider(await api.getStationDataProvider(session, nextStations[0].id));
        } else {
          setStationProvider(null);
        }
      } else {
        setProviders([]);
        setStationProvider(null);
      }
      setLoadState('success');
    } catch (cause) {
      setLoadState('error');
      setError(readError(cause));
    }
  }, [api, session]);

  useEffect(() => {
    if (session) void refresh();
  }, [session, refresh]);

  const reset = () => {
    clearSession();
    setSession(null);
    setMe(null);
    setSites([]);
    setStations([]);
    setProviders([]);
    setStationProvider(null);
    setStep(0);
    setError(null);
  };

  if (!session || step === 0) {
    return (
      <AppShell activeStep={0}>
        <AccountStep
          onCreated={(nextSession) => {
            saveSession(nextSession);
            setSession(nextSession);
            setStep(1);
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      activeStep={step}
      userLabel={me?.displayName || me?.username || me?.email}
      planLabel={organization?.plan}
    >
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-brand">
            <BrandLogo variant="blue" className="topbar-logo-full" />
            <BrandLogo variant="icon" className="topbar-logo-icon" />
          </div>
          <div>
            <span className="eyebrow">Local development</span>
            <h1>{organization?.name ?? 'Benchmark setup'}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          {organization && <span className={`plan-pill ${organization.plan.toLowerCase()}`}>{organization.plan}</span>}
          <button type="button" className="icon-button" onClick={() => void refresh()} title="Refresh from backend">
            <RefreshCw size={17} className={loadState === 'loading' ? 'spin' : ''} />
          </button>
          <button type="button" className="ghost-button" onClick={reset}>
            <RotateCcw size={16} /> Reset local session
          </button>
        </div>
      </header>

      {error && <ErrorBanner message={error} />}

      <div className="content-wrap">
        {step === 1 && organization && (
          <StationStep
            session={session}
            api={api}
            organization={organization}
            sites={sites}
            stations={stations}
            onChanged={async () => {
              await refresh();
            }}
            onContinue={() => setStep(2)}
          />
        )}
        {step === 2 && organization && (
          <ProviderStep
            session={session}
            api={api}
            organizationPlan={organization.plan}
            stations={stations}
            providers={providers}
            onChanged={refresh}
            onContinue={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && organization && (
          <VerifyStep
            session={session}
            me={me}
            organization={organization}
            sites={sites}
            stations={stations}
            providers={providers}
            linkedProvider={stationProvider}
            onBack={() => setStep(2)}
            onRefresh={refresh}
          />
        )}
      </div>
    </AppShell>
  );
}

function AccountStep({ onCreated }: { onCreated: (session: LocalSession) => void }) {
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [localAuthToken, setLocalAuthToken] = useState('');
  const [identitySubject, setIdentitySubject] = useState(() => `local-${crypto.randomUUID()}`);
  const [username, setUsername] = useState('adrian-test');
  const [email, setEmail] = useState('adrian-test@example.com');
  const [displayName, setDisplayName] = useState('Adrian Test');
  const [plan, setPlan] = useState<Plan>('PRO');
  const [premiumStations, setPremiumStations] = useState(5);
  const [working, setWorking] = useState(false);
  const [health, setHealth] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [error, setError] = useState<string | null>(null);

  const checkHealth = async () => {
    setHealth('unknown');
    setError(null);
    try {
      const api = new BenchmarkApi(apiBaseUrl.trim());
      await api.health();
      setHealth('ok');
    } catch (cause) {
      setHealth('error');
      setError(readError(cause));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/$/, '');
      const api = new BenchmarkApi(normalizedBaseUrl);
      const signup = await api.signupLocal({
        localAuthToken,
        identitySubject,
        username,
        email,
        displayName,
      });
      const organizationId = signup.organizations[0]?.organizationId;
      if (!organizationId) throw new Error('Signup did not return an organization.');

      if (plan !== 'FREE') {
        await api.overrideSubscription({
          localAuthToken,
          organizationId,
          plan,
          seatLimit: 1,
          stationLimit: plan === 'PREMIUM' ? Math.max(1, premiumStations) : 1,
        });
      }

      onCreated({
        apiBaseUrl: normalizedBaseUrl,
        localAuthToken,
        userId: signup.userId,
        organizationId,
      });
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="account-screen">
      <div className="account-hero">
        <BrandLogo variant="white" className="account-hero-logo" />
        <span className="eyebrow light">Benchmark v2</span>
        <h1>Build the account foundation first.</h1>
        <p>
          This local onboarding flow talks directly to your Spring Boot API. It creates a real user,
          personal organization, subscription and default site in PostgreSQL before you configure a station.
        </p>
        <div className="hero-points">
          <div><ShieldCheck size={18} /> Uses your local SUPERADMIN token</div>
          <div><Database size={18} /> Writes to the real local PostgreSQL schema</div>
          <div><MapPin size={18} /> Continues into coordinate/address/map station setup</div>
        </div>
      </div>

      <form className="account-card" onSubmit={submit}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Step 1 of 4</span>
            <h2>Create a local test user</h2>
          </div>
          <div className={`health-dot ${health}`} title="Backend health" />
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="field-grid full">
          <Field label="API base URL">
            <div className="input-with-action">
              <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} required />
              <button type="button" className="mini-button" onClick={() => void checkHealth()}>Check</button>
            </div>
          </Field>
          <Field label="LOCAL_AUTH_TOKEN" hint="Must match the token exported when benchmark-api starts.">
            <input
              type="password"
              value={localAuthToken}
              onChange={(e) => setLocalAuthToken(e.target.value)}
              placeholder="replace-with-a-long-random-development-secret"
              required
            />
          </Field>
        </div>

        <div className="section-label">User</div>
        <div className="field-grid">
          <Field label="Display name"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></Field>
          <Field label="Username"><input value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
          <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Identity subject" hint="Unique local identity; normally Cognito supplies this in production.">
            <input value={identitySubject} onChange={(e) => setIdentitySubject(e.target.value)} required />
          </Field>
        </div>

        <div className="section-label">Local subscription for testing</div>
        <div className="plan-grid">
          {(['FREE', 'PRO', 'PREMIUM'] as Plan[]).map((item) => (
            <button
              type="button"
              key={item}
              className={`plan-option ${plan === item ? 'selected' : ''}`}
              onClick={() => setPlan(item)}
            >
              <span>{item}</span>
              <small>
                {item === 'FREE' && '1 station · basic forecast'}
                {item === 'PRO' && '1 station · observations'}
                {item === 'PREMIUM' && 'N stations · ML forecast'}
              </small>
            </button>
          ))}
        </div>
        {plan === 'PREMIUM' && (
          <Field label="Premium station limit" hint="Local SUPERADMIN override only; Stripe remains the production source.">
            <input
              type="number"
              min={1}
              value={premiumStations}
              onChange={(e) => setPremiumStations(Number(e.target.value))}
            />
          </Field>
        )}

        <div className="dev-note">
          <CircleAlert size={18} />
          The local token is stored in browser localStorage only for this developer flow. Do not use this mechanism in production.
        </div>

        <button className="primary-button wide" disabled={working || !localAuthToken}>
          {working ? <><LoaderCircle size={17} className="spin" /> Creating account…</> : <>Create user & continue <ArrowRight size={17} /></>}
        </button>
      </form>
    </div>
  );
}

function StationStep({
  session,
  api,
  organization,
  sites,
  stations,
  onChanged,
  onContinue,
}: {
  session: LocalSession;
  api: BenchmarkApi;
  organization: CurrentUser['organizations'][number];
  sites: Site[];
  stations: WeatherStation[];
  onChanged: () => Promise<void>;
  onContinue: () => void;
}) {
  const [name, setName] = useState('My Station');
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [metadataText, setMetadataText] = useState('{}');
  const [siteName, setSiteName] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(stations.length === 0);

  useEffect(() => {
    if (!siteId && sites[0]) setSiteId(sites[0].id);
  }, [siteId, sites]);

  useEffect(() => {
    if (stations.length === 0) setShowForm(true);
  }, [stations.length]);

  const createSite = async () => {
    if (!siteName.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const created = await api.createSite(session, siteName.trim());
      setSiteId(created.id);
      setSiteName('');
      await onChanged();
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setWorking(false);
    }
  };

  const createStation = async (event: FormEvent) => {
    event.preventDefault();
    if (latitude == null || longitude == null) {
      setError('Choose a location by address, coordinates, or the map.');
      return;
    }

    let metadata: Record<string, unknown> | null = null;
    try {
      metadata = metadataText.trim() ? (JSON.parse(metadataText) as Record<string, unknown>) : null;
      if (metadata && (Array.isArray(metadata) || typeof metadata !== 'object')) {
        throw new Error('Metadata must be a JSON object.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Metadata must contain valid JSON.');
      return;
    }

    setWorking(true);
    setError(null);
    try {
      await api.createStation(session, {
        siteId: siteId || null,
        name: name.trim(),
        latitude,
        longitude,
        metadata,
      });
      await onChanged();
      setShowForm(false);
      setName('My Station');
      setLatitude(null);
      setLongitude(null);
      setMetadataText('{}');
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setWorking(false);
    }
  };

  const atCapacity = stations.length >= organization.stationLimit;
  return (
    <section>
      <StepHeading
        eyebrow="Step 2 of 4"
        title="Set up your station"
        description="Choose the station location in whichever way is easiest. All three methods stay synchronized."
      />

      <div className="usage-bar">
        <div>
          <span>Station capacity</span>
          <strong>{stations.length} / {organization.stationLimit}</strong>
        </div>
        <div className="usage-track"><div style={{ width: `${Math.min(100, (stations.length / Math.max(1, organization.stationLimit)) * 100)}%` }} /></div>
      </div>

      {stations.length > 0 && !showForm ? (
        <div className="station-summary-card">
          <div className="station-summary-heading">
            <div>
              <span className="eyebrow">Created stations</span>
              <h3>{stations.length} station{stations.length === 1 ? '' : 's'} ready</h3>
            </div>
            <div className="station-summary-actions">
              {!atCapacity && (
                <button type="button" className="secondary-button" onClick={() => setShowForm(true)}>
                  <Plus size={15} /> Add another station
                </button>
              )}
              <button className="primary-button" onClick={onContinue}>Continue <ArrowRight size={16} /></button>
            </div>
          </div>
          <div className="station-list">
            {stations.map((station) => {
              const site = sites.find((item) => item.id === station.siteId);
              return (
                <div className="station-list-item" key={station.id}>
                  <div className="success-icon"><Check size={18} /></div>
                  <div>
                    <strong>{station.name}</strong>
                    <span>{site?.name ?? 'Site'} · {station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}</span>
                  </div>
                  <span className="station-timezone">{station.timeZone}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <form className="station-layout" onSubmit={createStation}>
          <div className="station-form-panel">
            {error && <ErrorBanner message={error} />}
            <Field label="Station name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>

            <div className="field-row">
              <Field label="Site">
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </Field>
              {organization.plan === 'PREMIUM' && (
                <Field label="Create another site" hint="Sites are grouping metadata and do not consume station capacity.">
                  <div className="input-with-action">
                    <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="North Farm" />
                    <button type="button" className="mini-button" onClick={() => void createSite()} disabled={working}><Plus size={15} /> Add</button>
                  </div>
                </Field>
              )}
            </div>

            <div className="section-label">Find the location</div>
            <Field label="Address search" hint="Powered by OpenStreetMap Nominatim for local development.">
              <AddressSearch onSelect={(result) => {
                setLatitude(result.latitude);
                setLongitude(result.longitude);
              }} />
            </Field>

            <div className="coordinate-grid">
              <Field label="Latitude">
                <input
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  value={latitude ?? ''}
                  onChange={(e) => setLatitude(e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="27.6648"
                  required
                />
              </Field>
              <Field label="Longitude">
                <input
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  value={longitude ?? ''}
                  onChange={(e) => setLongitude(e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="-81.5158"
                  required
                />
              </Field>
            </div>

            <Field label="Metadata (optional JSON)" hint="Saved directly into PostgreSQL JSONB.">
              <textarea
                rows={5}
                value={metadataText}
                onChange={(e) => setMetadataText(e.target.value)}
                spellCheck={false}
                className="code-input"
              />
            </Field>

            <div className="station-actions">
              <div className="coordinate-status">
                <MapPin size={16} />
                {latitude != null && longitude != null
                  ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                  : 'No location selected'}
              </div>
              <button className="primary-button" disabled={working || atCapacity || latitude == null || longitude == null}>
                {working ? <><LoaderCircle size={16} className="spin" /> Saving…</> : <>Create station <ArrowRight size={16} /></>}
              </button>
            </div>
          </div>

          <div className="map-panel">
            <div className="map-panel-header">
              <div>
                <span className="eyebrow">Map explorer</span>
                <strong>Click or drag the pin</strong>
              </div>
              <span className="map-help">Base map / Satellite</span>
            </div>
            <MapPicker
              latitude={latitude}
              longitude={longitude}
              onChange={(lat, lon) => {
                setLatitude(Number(lat.toFixed(7)));
                setLongitude(Number(lon.toFixed(7)));
              }}
            />
          </div>
        </form>
      )}
    </section>
  );
}

function ProviderStep({
  session,
  api,
  organizationPlan,
  stations,
  providers,
  onChanged,
  onContinue,
  onBack,
}: {
  session: LocalSession;
  api: BenchmarkApi;
  organizationPlan: Plan;
  stations: WeatherStation[];
  providers: DataProvider[];
  onChanged: () => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
}) {
  const firstUnlinked = stations.find((station) => !station.dataProviderId) ?? stations[0] ?? null;
  const [stationId, setStationId] = useState(firstUnlinked?.id ?? '');
  const [mode, setMode] = useState<'existing' | 'new'>(providers.length ? 'existing' : 'new');
  const [selectedProviderId, setSelectedProviderId] = useState(providers[0]?.id ?? '');
  const [name, setName] = useState('My WeatherLink Account');
  const [provider, setProvider] = useState('WEATHER_LINK');
  const [apiKey, setApiKey] = useState('');
  const [apiKeySecret, setApiKeySecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [region, setRegion] = useState('');
  const [providerStationId, setProviderStationId] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProviderId && providers[0]) setSelectedProviderId(providers[0].id);
  }, [providers, selectedProviderId]);

  useEffect(() => {
    if (!stationId && firstUnlinked) setStationId(firstUnlinked.id);
  }, [firstUnlinked, stationId]);

  const station = stations.find((item) => item.id === stationId) ?? stations[0] ?? null;
  const linkedProvider = station?.dataProviderId
    ? providers.find((item) => item.id === station.dataProviderId) ?? null
    : null;

  if (!station) {
    return (
      <section>
        <StepHeading eyebrow="Step 3 of 4" title="Connect observations" description="Create a station first." />
        <ErrorBanner message="No station exists yet. Return to station setup." />
        <button className="secondary-button" onClick={onBack}>Back to station</button>
      </section>
    );
  }

  if (organizationPlan === 'FREE') {
    return (
      <section>
        <StepHeading
          eyebrow="Step 3 of 4"
          title="Observation provider"
          description="FREE includes the basic forecast service. Observation providers start with PRO."
        />
        <div className="locked-panel">
          <ShieldCheck size={28} />
          <div>
            <h3>No provider required for FREE</h3>
            <p>Your station is already valid for the basic forecast flow. Continue to verify the database records.</p>
          </div>
          <button className="primary-button" onClick={onContinue}>Continue <ArrowRight size={16} /></button>
        </div>
      </section>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      let dataProviderId = selectedProviderId;
      if (mode === 'new') {
        const created = await api.createDataProvider(session, {
          name: name.trim(),
          provider,
          apiKey: apiKey || undefined,
          apiKeySecret: apiKeySecret || undefined,
          username: username || undefined,
          password: password || undefined,
          token: token || undefined,
          region: region || undefined,
        });
        dataProviderId = created.id;
      }
      if (!dataProviderId) throw new Error('Select or create a data provider.');
      await api.linkStationDataProvider(session, station.id, dataProviderId, providerStationId.trim());
      await onChanged();
      setProviderStationId('');
      setMode('existing');
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section>
      <StepHeading
        eyebrow="Step 3 of 4"
        title="Connect station observations"
        description="Reuse credentials already stored for the organization, or add another hardware/provider account."
      />

      {stations.length > 1 && (
        <div className="provider-station-selector">
          <span>Configure station</span>
          <select value={station.id} onChange={(event) => setStationId(event.target.value)}>
            {stations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}{item.dataProviderId ? ` — ${item.provider ?? 'Provider linked'}` : ' — Not linked'}
              </option>
            ))}
          </select>
        </div>
      )}

      {station.dataProviderId ? (
        <div className="success-panel">
          <div className="success-icon"><Link2 size={22} /></div>
          <div className="success-body">
            <span className="eyebrow">Provider linked to {station.name}</span>
            <h3>{linkedProvider?.name ?? station.provider ?? 'Data provider'}</h3>
            <div className="detail-row">
              <span>{station.provider}</span>
              <span>Station ID: {station.providerStationId}</span>
              <span>Reusable credentials</span>
            </div>
          </div>
          <div className="station-summary-actions">
            {stations.some((item) => !item.dataProviderId) && (
              <button
                className="secondary-button"
                onClick={() => setStationId(stations.find((item) => !item.dataProviderId)!.id)}
              >
                Configure another
              </button>
            )}
            <button className="primary-button" onClick={onContinue}>Verify setup <ArrowRight size={16} /></button>
          </div>
        </div>
      ) : (
        <form className="provider-card" onSubmit={submit}>
          {error && <ErrorBanner message={error} />}
          <div className="selected-station-strip">
            <MapPin size={16} />
            <div><strong>{station.name}</strong><span>{station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}</span></div>
          </div>
          <div className="choice-tabs">
            <button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')} disabled={!providers.length}>
              Reuse existing provider <span>{providers.length}</span>
            </button>
            <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>Create new provider</button>
          </div>

          {mode === 'existing' ? (
            <div className="provider-existing-grid">
              {providers.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`provider-option ${selectedProviderId === item.id ? 'selected' : ''}`}
                  onClick={() => setSelectedProviderId(item.id)}
                >
                  <div className="provider-logo"><RadioTower size={19} /></div>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.provider}</span>
                  </div>
                  {selectedProviderId === item.id && <CheckCircle2 size={19} />}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="field-grid">
                <Field label="Provider name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
                <Field label="Hardware / provider">
                  <input list="provider-options" value={provider} onChange={(e) => setProvider(e.target.value.toUpperCase())} required />
                  <datalist id="provider-options">{PROVIDERS.map((item) => <option key={item} value={item} />)}</datalist>
                </Field>
                <Field label="API key"><input value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" /></Field>
                <Field label="API key secret"><input type="password" value={apiKeySecret} onChange={(e) => setApiKeySecret(e.target.value)} autoComplete="new-password" /></Field>
                <Field label="Username"><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></Field>
                <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
                <Field label="Token"><input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" /></Field>
                <Field label="Region"><input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Optional" /></Field>
              </div>
              <div className="credential-note"><ShieldCheck size={16} /> Credential values are sent to the backend but never returned by provider response DTOs.</div>
            </>
          )}

          <div className="section-label">Station-specific mapping</div>
          <Field
            label="Provider station identifier"
            hint="This belongs to the physical station, not to the reusable credential record."
          >
            <input value={providerStationId} onChange={(e) => setProviderStationId(e.target.value)} placeholder="e.g. 123456 or device serial" required />
          </Field>

          <div className="form-footer">
            <button type="button" className="secondary-button" onClick={onBack}>Back</button>
            <button className="primary-button" disabled={working || !providerStationId.trim()}>
              {working ? <><LoaderCircle size={16} className="spin" /> Linking…</> : <>Save provider link <ArrowRight size={16} /></>}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function VerifyStep({
  session,
  me,
  organization,
  sites,
  stations,
  providers,
  linkedProvider,
  onBack,
  onRefresh,
}: {
  session: LocalSession;
  me: CurrentUser | null;
  organization: CurrentUser['organizations'][number];
  sites: Site[];
  stations: WeatherStation[];
  providers: DataProvider[];
  linkedProvider: StationDataProvider | null;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const sql = `SELECT id, username, email FROM users WHERE id = '${session.userId}';\n\nSELECT * FROM organizations WHERE id = '${session.organizationId}';\nSELECT * FROM sites WHERE organization_id = '${session.organizationId}';\nSELECT * FROM weather_stations WHERE organization_id = '${session.organizationId}';\nSELECT id, organization_id, name, provider, region FROM data_providers WHERE organization_id = '${session.organizationId}';`;

  const checks = [
    { label: 'User provisioned', ok: Boolean(me?.id) },
    { label: 'Organization + subscription', ok: Boolean(organization.id && organization.plan) },
    { label: 'Default/site grouping', ok: sites.length > 0 },
    { label: 'Station + timezone', ok: stations.some((station) => Boolean(station.timeZone)) },
    {
      label: 'Observation provider',
      ok: organization.plan === 'FREE' ? true : stations.some((station) => Boolean(station.dataProviderId)),
      optional: organization.plan === 'FREE',
    },
  ];

  return (
    <section>
      <StepHeading
        eyebrow="Step 4 of 4"
        title="Validate the local foundation"
        description="Everything below is loaded back from benchmark-api, not from optimistic frontend state."
      />

      <div className="verification-grid">
        <div className="verification-card">
          <div className="card-heading"><h3>Application checks</h3><button className="icon-button" onClick={() => void onRefresh()}><RefreshCw size={16} /></button></div>
          <div className="check-list">
            {checks.map((check) => (
              <div className="check-row" key={check.label}>
                <div className={`check-icon ${check.ok ? 'ok' : 'missing'}`}>{check.ok ? <Check size={15} /> : <CircleAlert size={15} />}</div>
                <span>{check.label}</span>
                <strong>{check.optional ? 'Not required' : check.ok ? 'Ready' : 'Missing'}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="verification-card">
          <h3>Current subscription</h3>
          <div className="metric-grid">
            <Metric label="Plan" value={organization.plan} />
            <Metric label="Station usage" value={`${stations.length} / ${organization.stationLimit}`} />
            <Metric label="Sites" value={String(sites.length)} />
            <Metric label="Providers" value={String(providers.length)} />
          </div>
        </div>
      </div>

      <div className="db-panel">
        <div className="db-panel-heading">
          <div><Database size={20} /><div><strong>PostgreSQL verification</strong><span>Run these against the local benchmark database.</span></div></div>
          <button
            className="secondary-button"
            onClick={async () => {
              await navigator.clipboard.writeText(sql);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy size={15} /> {copied ? 'Copied' : 'Copy SQL'}
          </button>
        </div>
        <pre>{sql}</pre>
      </div>

      <details className="raw-details">
        <summary>Backend response snapshot</summary>
        <pre>{JSON.stringify({ me, sites, stations, providers, linkedProvider }, null, 2)}</pre>
      </details>

      <div className="forecast-next">
        <div className="forecast-icon"><Sparkles size={24} /></div>
        <div>
          <span className="eyebrow">Foundation complete</span>
          <h3>Ready for the forecast layer</h3>
          <p>User identity, subscription capacity, site grouping, station coordinates/timezone and observation-provider mapping are now testable end to end.</p>
        </div>
      </div>

      <div className="form-footer">
        <button className="secondary-button" onClick={onBack}>Back</button>
        <a className="primary-button" href={`${session.apiBaseUrl}/docs`} target="_blank" rel="noreferrer">Open API docs <ExternalLink size={15} /></a>
      </div>
    </section>
  );
}

function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="step-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="error-banner"><CircleAlert size={18} /><span>{message}</span></div>;
}

function readError(cause: unknown): string {
  if (cause instanceof BenchmarkApiError) return `${cause.message} (HTTP ${cause.status})`;
  if (cause instanceof Error) return cause.message;
  return 'Unexpected error.';
}

export default App;
