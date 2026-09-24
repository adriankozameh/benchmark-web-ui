import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Gauge,
  LoaderCircle,
  LogOut,
  MapPin,
  Plus,
  RadioTower,
  Settings,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import { CognitoPkceAuth } from '@benchmark/auth';
import type { CurrentUser, Site, WeatherStation } from '@benchmark/domain';
import { hasValidationErrors, validateStation } from '@benchmark/validation';
import type { StationValidationErrors } from '@benchmark/validation';
import { AddressSearch } from './components/AddressSearch';
import { BrandLogo } from './components/BrandLogo';
import { ForecastDashboard } from './components/ForecastDashboard';
import { MapPicker } from './components/MapPicker';
import { loadAppConfig } from './config';
import type { AppConfig, ConfigurationIssue } from './config';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

type StationDraft = {
  name: string;
  siteId: string;
  latitude: string;
  longitude: string;
};

const emptyDraft: StationDraft = {
  name: '',
  siteId: '',
  latitude: '',
  longitude: '',
};

function readError(error: unknown): string {
  if (error instanceof BenchmarkApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

function App() {
  const configResult = useMemo(() => loadAppConfig(), []);

  if (!configResult.ok) {
    return <ConfigurationError issues={configResult.issues} />;
  }

  return <ConfiguredApp config={configResult.config} />;
}

function ConfiguredApp({ config }: { config: AppConfig }) {
  const auth = useMemo(
    () =>
      new CognitoPkceAuth({
        domain: config.cognitoDomain,
        clientId: config.cognitoClientId,
        redirectUri: config.cognitoRedirectUri,
        logoutUri: config.cognitoLogoutUri,
      }),
    [config],
  );
  const api = useMemo(
    () => new BenchmarkApi(config.apiBaseUrl, () => auth.getAccessToken()),
    [auth, config.apiBaseUrl],
  );

  const [authenticated, setAuthenticated] = useState(() => auth.isAuthenticated());
  const [callbackState, setCallbackState] = useState<LoadState>('idle');
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const onUnauthorized = useCallback(() => {
    auth.clear();
    setAuthenticated(false);
  }, [auth]);

  useEffect(() => {
    if (window.location.pathname !== '/auth/callback') return;

    let cancelled = false;
    setCallbackState('loading');
    void auth
      .handleCallback()
      .then(() => {
        if (cancelled) return;
        setAuthenticated(true);
        setCallbackState('success');
        window.history.replaceState({}, '', '/settings');
      })
      .catch((error) => {
        if (cancelled) return;
        setCallbackError(readError(error));
        setCallbackState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [auth]);

  if (window.location.pathname === '/auth/callback' && callbackState !== 'success') {
    return <AuthCallback state={callbackState} error={callbackError} />;
  }

  if (!authenticated) {
    return (
      <AuthScreen
        onLogin={() => void auth.begin('login')}
        onSignup={() => void auth.begin('signup')}
        onGoogle={() => void auth.beginWithProvider('Google')}
        googleEnabled={config.googleAuthEnabled}
      />
    );
  }

  return (
    <AuthenticatedApp
      api={api}
      onLogout={() => auth.logout()}
      onUnauthorized={onUnauthorized}
    />
  );
}

function ConfigurationError({ issues }: { issues: ConfigurationIssue[] }) {
  return (
    <div className="configuration-error-screen">
      <div className="configuration-error-card">
        <BrandLogo variant="blue" className="configuration-error-logo" />
        <div className="configuration-error-icon"><CircleAlert size={24} /></div>
        <span className="eyebrow">Configuration required</span>
        <h1>Benchmark couldn't start.</h1>
        <p>One or more required frontend environment variables are missing or invalid.</p>

        <ul className="configuration-error-list">
          {issues.map((issue) => (
            <li key={`${issue.key}:${issue.message}`}>
              <code>{issue.key}</code> {issue.message}
            </li>
          ))}
        </ul>

        <div className="configuration-help">
          <strong>Local setup</strong>
          <code>cp apps/web/.env.example apps/web/.env</code>
          <span>Then restart Vite with pnpm dev.</span>
        </div>
      </div>
    </div>
  );
}

function AuthCallback({ state, error }: { state: LoadState; error: string | null }) {
  return (
    <div className="callback-screen">
      <BrandLogo variant="blue" className="callback-logo" />
      {state === 'error' ? (
        <>
          <CircleAlert size={34} />
          <h1>We couldn't finish signing you in.</h1>
          <p>{error}</p>
          <a className="primary-button" href="/">Return to Benchmark</a>
        </>
      ) : (
        <>
          <LoaderCircle className="spin" size={34} />
          <h1>Signing you in…</h1>
          <p>Connecting your Cognito account to Benchmark.</p>
        </>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.703-1.568 2.684-3.88 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A8.999 8.999 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.707V4.961H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.039l3.007-2.332Z" />
      <path fill="#EA4335" d="M9 3.579c1.322 0 2.507.454 3.44 1.346l2.582-2.582C13.464.892 11.426 0 9 0A8.999 8.999 0 0 0 .956 4.961l3.007 2.332C4.672 5.164 6.656 3.579 9 3.579Z" />
    </svg>
  );
}

function AuthScreen({ onLogin, onSignup, onGoogle, googleEnabled }: { onLogin: () => void; onSignup: () => void; onGoogle: () => void; googleEnabled: boolean }) {
  return (
    <div className="auth-layout">
      <section className="auth-hero">
        <BrandLogo variant="white" className="auth-logo" />
        <div className="auth-copy">
          <span className="eyebrow light">Benchmark weather intelligence</span>
          <h1>Your weather network starts with one station.</h1>
          <p>
            Sign in to Benchmark, configure your first station, and build from there. The same
            account will later power the web, iPhone, iPad, and Android experiences.
          </p>
        </div>
        <div className="auth-feature-row">
          <div><RadioTower size={19} /><span>Stations</span></div>
          <div><Gauge size={19} /><span>Forecasts</span></div>
          <div><SlidersHorizontal size={19} /><span>Configuration</span></div>
        </div>
      </section>

      <section className="auth-panel-wrap">
        <div className="auth-panel">
          <div className="auth-panel-mark"><BrandLogo variant="icon" /></div>
          <span className="eyebrow">Welcome to Benchmark</span>
          <h2>Sign in to continue</h2>
          <p className="muted">
            Authentication is handled securely by your Benchmark Cognito account.
          </p>

          {googleEnabled && (
            <>
              <button className="google-button wide" type="button" onClick={onGoogle}>
                <GoogleMark />
                Continue with Google
              </button>

              <div className="auth-divider" role="separator" aria-label="or">
                <span>or</span>
              </div>
            </>
          )}

          <button className="primary-button wide" type="button" onClick={onLogin}>
            Log in with email <ChevronRight size={17} />
          </button>
          <button className="secondary-button wide" type="button" onClick={onSignup}>
            Create account with email
          </button>

          <div className="auth-footnote">
            New accounts are provisioned automatically on the first authenticated API request.
          </div>
        </div>
      </section>
    </div>
  );
}

function AuthenticatedApp({
  api,
  onLogout,
  onUnauthorized,
}: {
  api: BenchmarkApi;
  onLogout: () => void;
  onUnauthorized: () => void;
}) {
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [stations, setStations] = useState<WeatherStation[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<'dashboard' | 'settings'>(
    () => window.location.pathname === '/dashboard' ? 'dashboard' : 'settings',
  );

  useEffect(() => {
    const handlePopState = () => setPage(window.location.pathname === '/dashboard' ? 'dashboard' : 'settings');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(nextPage: 'dashboard' | 'settings') {
    window.history.pushState({}, '', `/${nextPage}`);
    setPage(nextPage);
  }

  const organization = useMemo(
    () => me?.organizations.find((item) => item.organizationStatus === 'ACTIVE') ?? me?.organizations[0] ?? null,
    [me],
  );

  const refresh = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const nextMe = await api.getMe();
      const nextOrganization =
        nextMe.organizations.find((item) => item.organizationStatus === 'ACTIVE') ?? nextMe.organizations[0];
      if (!nextOrganization) throw new Error('No Benchmark organization is available for this account.');

      const [nextSites, nextStations] = await Promise.all([
        api.listSites(nextOrganization.id),
        api.listStations(nextOrganization.id),
      ]);
      setMe(nextMe);
      setSites(nextSites);
      setStations(nextStations);
      setState('success');
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(readError(cause));
      setState('error');
    }
  }, [api, onUnauthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state === 'loading' && !me) {
    return (
      <div className="callback-screen">
        <BrandLogo variant="blue" className="callback-logo" />
        <LoaderCircle className="spin" size={34} />
        <h1>Preparing your account…</h1>
        <p>Loading your Benchmark organization and station settings.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BrandLogo variant="white" className="sidebar-logo" />
        <BrandLogo variant="icon" className="sidebar-icon-logo" />
        <div className="sidebar-label">Workspace</div>
        <nav className="sidebar-nav">
          <button type="button" className={`nav-item ${page === 'dashboard' ? 'active' : ''}`}
            aria-current={page === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}>
            <Gauge size={17} /> <span>Dashboard</span>
          </button>
          <button type="button" className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>
            <Settings size={17} /> <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-label settings-label">Settings</div>
        <nav className="sidebar-nav">
          <button type="button" className={`nav-item ${page === 'settings' ? 'active secondary-active' : ''}`}
            onClick={() => navigate('settings')}>
            <MapPin size={17} /> <span>Stations</span>
          </button>
          <button type="button" className="nav-item disabled" disabled>
            <RadioTower size={17} /> <span>Data providers</span><small>Soon</small>
          </button>
          <button type="button" className="nav-item disabled" disabled>
            <UserRound size={17} /> <span>Account</span><small>Soon</small>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-summary">
            <div className="avatar">{(me?.displayName || me?.email || 'B').charAt(0).toUpperCase()}</div>
            <div className="user-summary-copy">
              <strong>{me?.displayName || me?.email || 'Benchmark user'}</strong>
              <span>{organization?.plan ?? 'FREE'} plan</span>
            </div>
          </div>
          <button type="button" className="icon-button inverse" onClick={onLogout} aria-label="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-mobile-brand">
            <BrandLogo variant="icon" />
          </div>
          <div className="topbar-title">
            <span className="eyebrow">{page === 'dashboard' ? 'Dashboard' : 'Settings'}</span>
            <h1>{page === 'dashboard' ? 'Forecasts' : 'Weather stations'}</h1>
          </div>
          <div className="topbar-actions">
            {organization && <span className={`plan-pill ${organization.plan.toLowerCase()}`}>{organization.plan}</span>}
            <button type="button" className="icon-button mobile-logout" onClick={onLogout} aria-label="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {error && (
            <div className="alert error">
              <CircleAlert size={18} />
              <div><strong>Unable to load settings</strong><span>{error}</span></div>
            </div>
          )}

          {organization && (page === 'dashboard'
            ? <ForecastDashboard api={api} organizationId={organization.id} stations={stations}
                onUnauthorized={onUnauthorized} />
            : <StationSettings api={api} organizationId={organization.id}
                stationLimit={organization.stationLimit} sites={sites} stations={stations}
                onCreated={refresh} />)}
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        <button type="button" className={page === 'dashboard' ? 'active' : ''}
          aria-current={page === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}>
          <Gauge size={20} />
          <span>Dashboard</span>
        </button>
        <button type="button" className={page === 'settings' ? 'active' : ''}
          aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>
          <MapPin size={20} />
          <span>Stations</span>
        </button>
        <button type="button" disabled aria-label="Account coming soon">
          <UserRound size={20} />
          <span>Account</span>
        </button>
      </nav>
    </div>
  );
}

function StationSettings({
  api,
  organizationId,
  stationLimit,
  sites,
  stations,
  onCreated,
}: {
  api: BenchmarkApi;
  organizationId: string;
  stationLimit: number;
  sites: Site[];
  stations: WeatherStation[];
  onCreated: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(stations.length === 0);
  const [draft, setDraft] = useState<StationDraft>(() => ({ ...emptyDraft, siteId: sites[0]?.id ?? '' }));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<StationValidationErrors>({});

  useEffect(() => {
    if (!draft.siteId && sites[0]) setDraft((current) => ({ ...current, siteId: sites[0].id }));
  }, [draft.siteId, sites]);

  useEffect(() => {
    if (stations.length === 0) setShowForm(true);
  }, [stations.length]);

  const atLimit = stations.length >= stationLimit;
  const lat = draft.latitude === '' ? null : Number(draft.latitude);
  const lon = draft.longitude === '' ? null : Number(draft.longitude);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = {
      siteId: draft.siteId || null,
      name: draft.name.trim(),
      latitude: Number(draft.latitude),
      longitude: Number(draft.longitude),
      metadata: null,
    };
    const errors = validateStation(input);
    setFieldErrors(errors);
    if (hasValidationErrors(errors)) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await api.createStation(organizationId, input);
      setDraft({ ...emptyDraft, siteId: sites[0]?.id ?? '' });
      setShowForm(false);
      await onCreated();
    } catch (cause) {
      setFormError(readError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="page-heading-row">
        <div>
          <h2>{stations.length === 0 ? 'Set up your first station' : 'Your stations'}</h2>
          <p>
            Benchmark uses each station's precise coordinates to resolve timezone and weather data.
          </p>
        </div>
        {stations.length > 0 && !showForm && (
          <button className="primary-button" type="button" onClick={() => setShowForm(true)} disabled={atLimit}>
            <Plus size={16} /> Add station
          </button>
        )}
      </section>

      <div className="usage-card">
        <div>
          <span className="eyebrow">Station capacity</span>
          <strong>{stations.length} of {stationLimit}</strong>
        </div>
        <div className="usage-track"><span style={{ width: `${Math.min(100, (stations.length / Math.max(1, stationLimit)) * 100)}%` }} /></div>
      </div>

      {stations.length > 0 && (
        <div className="station-list-card">
          {stations.map((station) => (
            <div className="station-row" key={station.id}>
              <div className="station-icon"><MapPin size={17} /></div>
              <div>
                <strong>{station.name}</strong>
                <span>{station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}</span>
              </div>
              <div className="station-meta">
                <span>{station.timeZone}</span>
                <small>{station.status}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && !atLimit && (
        <form className="station-form-card" onSubmit={submit}>
          <div className="form-card-heading">
            <div>
              <span className="eyebrow">Station configuration</span>
              <h3>{stations.length === 0 ? 'Tell us where your station is' : 'Add another station'}</h3>
            </div>
            {stations.length > 0 && (
              <button className="text-button" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            )}
          </div>

          {formError && <div className="alert error compact"><CircleAlert size={17} /><span>{formError}</span></div>}

          <div className="station-layout">
            <div className="station-form-fields">
              <label className="field">
                <span>Station name</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="e.g. North Field"
                  autoFocus
                />
                {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
              </label>

              <label className="field">
                <span>Site</span>
                <select value={draft.siteId} onChange={(event) => setDraft({ ...draft, siteId: event.target.value })}>
                  {sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}
                </select>
                <small>Every new account already has a Default Site.</small>
              </label>

              <div className="field">
                <span>Find location</span>
                <AddressSearch
                  onSelect={(location) =>
                    setDraft((current) => ({
                      ...current,
                      latitude: location.latitude.toFixed(6),
                      longitude: location.longitude.toFixed(6),
                    }))
                  }
                />
                <small>Search, enter coordinates, or click the map.</small>
              </div>

              <div className="coordinate-grid">
                <label className="field">
                  <span>Latitude</span>
                  <input
                    inputMode="decimal"
                    value={draft.latitude}
                    onChange={(event) => setDraft({ ...draft, latitude: event.target.value })}
                    placeholder="40.123456"
                  />
                  {fieldErrors.latitude && <small className="field-error">{fieldErrors.latitude}</small>}
                </label>
                <label className="field">
                  <span>Longitude</span>
                  <input
                    inputMode="decimal"
                    value={draft.longitude}
                    onChange={(event) => setDraft({ ...draft, longitude: event.target.value })}
                    placeholder="-96.123456"
                  />
                  {fieldErrors.longitude && <small className="field-error">{fieldErrors.longitude}</small>}
                </label>
              </div>

              <button className="primary-button wide" type="submit" disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}
                {submitting ? 'Saving station…' : 'Save station'}
              </button>
            </div>

            <div className="map-card">
              <MapPicker
                latitude={Number.isFinite(lat) ? lat : null}
                longitude={Number.isFinite(lon) ? lon : null}
                onChange={(latitude, longitude) =>
                  setDraft((current) => ({
                    ...current,
                    latitude: latitude.toFixed(6),
                    longitude: longitude.toFixed(6),
                  }))
                }
              />
              <div className="map-caption"><MapPin size={15} /> Click or drag the pin to place the station.</div>
            </div>
          </div>
        </form>
      )}

      {atLimit && (
        <div className="alert neutral">
          <CheckCircle2 size={18} />
          <div><strong>Station capacity reached</strong><span>Your current plan allows {stationLimit} station{stationLimit === 1 ? '' : 's'}.</span></div>
        </div>
      )}
    </>
  );
}

export default App;
