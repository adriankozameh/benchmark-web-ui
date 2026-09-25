import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { CurrentUser, Site, UserSettings, WeatherStation, UserLanguage, DisplayUnits } from '@benchmark/domain';
import { hasValidationErrors, validateStation } from '@benchmark/validation';
import type { StationValidationErrors } from '@benchmark/validation';
import { AddressSearch } from './components/AddressSearch';
import { BrandLogo } from './components/BrandLogo';
import { ForecastDashboard } from './components/ForecastDashboard';
import { MapPicker } from './components/MapPicker';
import { errorMessage, t } from './language';
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
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [stations, setStations] = useState<WeatherStation[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const languageRef = useRef<UserLanguage>('en');
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

      const [nextSettings, nextSites, nextStations] = await Promise.all([
        api.getUserSettings(),
        api.listSites(nextOrganization.id),
        api.listStations(nextOrganization.id),
      ]);
      setMe(nextMe);
      setUserSettings(nextSettings);
      languageRef.current = nextSettings.metadata.language;
      setSites(nextSites);
      setStations(nextStations);
      setState('success');
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(errorMessage(cause, languageRef.current));
      setState('error');
    }
  }, [api, onUnauthorized]);

  const language: UserLanguage = userSettings?.metadata.language ?? 'en';
  useEffect(() => {
    document.documentElement.lang = language;
    return () => { document.documentElement.lang = 'en'; };
  }, [language]);
  const units: DisplayUnits = userSettings?.metadata.units === 'IMPERIAL' ? 'IMPERIAL' : 'METRIC';

  async function saveSettings(metadata: { language: UserLanguage; units: DisplayUnits }) {
    const updated = await api.updateUserSettings(metadata);
    setUserSettings(updated);
    languageRef.current = updated.metadata.language;
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state === 'loading' && !me) {
    return (
      <div className="callback-screen">
        <BrandLogo variant="blue" className="callback-logo" />
        <LoaderCircle className="spin" size={34} />
        <h1>{t('Preparing your account…', language)}</h1>
        <p>{t('Loading your Benchmark organization and station settings.', language)}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BrandLogo variant="white" className="sidebar-logo" />
        <BrandLogo variant="icon" className="sidebar-icon-logo" />
        <div className="sidebar-label">{t('Workspace', language)}</div>
        <nav className="sidebar-nav">
          <button type="button" className={`nav-item ${page === 'dashboard' ? 'active' : ''}`}
            aria-current={page === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}>
            <Gauge size={17} /> <span>{t('Dashboard', language)}</span>
          </button>
          <button type="button" className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>
            <Settings size={17} /> <span>{t('Settings', language)}</span>
          </button>
        </nav>

        <div className="sidebar-label settings-label">{t('Settings', language)}</div>
        <nav className="sidebar-nav">
          <button type="button" className={`nav-item ${page === 'settings' ? 'active secondary-active' : ''}`}
            onClick={() => navigate('settings')}>
            <MapPin size={17} /> <span>{t('Stations', language)}</span>
          </button>
          <button type="button" className="nav-item disabled" disabled>
            <RadioTower size={17} /> <span>{t('Data providers', language)}</span><small>{t('Soon', language)}</small>
          </button>
          <button type="button" className={`nav-item ${page === 'settings' ? 'secondary-active' : ''}`}
            onClick={() => navigate('settings')}>
            <UserRound size={17} /> <span>{t('Account', language)}</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-summary">
            <div className="avatar">{(me?.displayName || me?.email || 'B').charAt(0).toUpperCase()}</div>
            <div className="user-summary-copy">
              <strong>{me?.displayName || me?.email || t('Benchmark user', language)}</strong>
              <span>{language === 'es' ? `${t('plan', language)} ${t(organization?.plan ?? 'FREE', language)}` : `${organization?.plan ?? 'FREE'} plan`}</span>
            </div>
          </div>
          <button type="button" className="icon-button inverse" onClick={onLogout} aria-label={t('Log out', language)}>
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
            <span className="eyebrow">{t(page === 'dashboard' ? 'Dashboard' : 'Settings', language)}</span>
            <h1>{t(page === 'dashboard' ? 'Forecasts' : 'Weather stations', language)}</h1>
          </div>
          <div className="topbar-actions">
            {organization && <span className={`plan-pill ${organization.plan.toLowerCase()}`}>{t(organization.plan, language)}</span>}
            <button type="button" className="icon-button mobile-logout" onClick={onLogout} aria-label={t('Log out', language)}>
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {error && (
            <div className="alert error">
              <CircleAlert size={18} />
              <div><strong>{t('Unable to load settings', language)}</strong><span>{error}</span></div>
            </div>
          )}

          {organization && (page === 'dashboard'
            ? <ForecastDashboard api={api} organizationId={organization.id} stations={stations} units={units} language={language}
                onUnauthorized={onUnauthorized} />
            : <>
                {userSettings && <UserPreferences settings={userSettings} onSave={saveSettings} onUnauthorized={onUnauthorized} />}
                <StationSettings api={api} organizationId={organization.id}
                  stationLimit={organization.stationLimit} sites={sites} stations={stations}
                  onCreated={refresh} language={language} />
              </>)}
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label={t('Primary navigation', language)}>
        <button type="button" className={page === 'dashboard' ? 'active' : ''}
          aria-current={page === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}>
          <Gauge size={20} />
          <span>{t('Dashboard', language)}</span>
        </button>
        <button type="button" className={page === 'settings' ? 'active' : ''}
          aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>
          <MapPin size={20} />
          <span>{t('Stations', language)}</span>
        </button>
        <button type="button" onClick={() => navigate('settings')} aria-label={t('Account', language)}>
          <UserRound size={20} />
          <span>{t('Account', language)}</span>
        </button>
      </nav>
    </div>
  );
}

function UserPreferences({ settings, onSave, onUnauthorized }: {
  settings: UserSettings;
  onSave: (metadata: { language: UserLanguage; units: DisplayUnits }) => Promise<void>;
  onUnauthorized: () => void;
}) {
  const [language, setLanguage] = useState<UserLanguage>(settings.metadata.language);
  const [units, setUnits] = useState<DisplayUnits>(settings.metadata.units);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLanguage(settings.metadata.language);
    setUnits(settings.metadata.units);
  }, [settings]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await onSave({ language, units });
      setSaved(true);
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(errorMessage(cause, language));
    } finally {
      setSaving(false);
    }
  }

  return <form className="station-form-card user-preferences" onSubmit={(event) => void submit(event)}>
    <h2>{t('Your preferences', language)}</h2>
    <p>{t('These choices apply to all your stations and devices.', language)}</p>
    <div className="user-preferences-fields">
      <label className="field">
        <span>{t('Language', language)}</span>
        <select value={language} onChange={(event) => { setLanguage(event.target.value as UserLanguage); setSaved(false); }}>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </label>
      <label className="field">
        <span>{t('Units', language)}</span>
        <select value={units} onChange={(event) => { setUnits(event.target.value as DisplayUnits); setSaved(false); }}>
          <option value="METRIC">{t('Metric (°C, m/s, mm)', language)}</option>
          <option value="IMPERIAL">{t('Imperial (°F, mph, in)', language)}</option>
        </select>
      </label>
    </div>
    {error && <div className="alert error compact"><CircleAlert size={17} /><span>{error}</span></div>}
    <div className="user-preferences-actions">
      <button className="primary-button" type="submit" disabled={saving ||
          (language === settings.metadata.language && units === settings.metadata.units)}>
        {saving ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}
        {t('Save preferences', language)}
      </button>
      {saved && <span role="status">{t('Saved', language)}</span>}
    </div>
  </form>;
}

function StationSettings({
  api,
  organizationId,
  stationLimit,
  sites,
  stations,
  onCreated,
  language,
}: {
  api: BenchmarkApi;
  organizationId: string;
  stationLimit: number;
  sites: Site[];
  stations: WeatherStation[];
  onCreated: () => Promise<void>;
  language: UserLanguage;
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
      setFormError(errorMessage(cause, language));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="page-heading-row">
        <div>
          <h2>{t(stations.length === 0 ? 'Set up your first station' : 'Your stations', language)}</h2>
          <p>
            {t("Benchmark uses each station's precise coordinates to resolve timezone and weather data.", language)}
          </p>
        </div>
        {stations.length > 0 && !showForm && (
          <button className="primary-button" type="button" onClick={() => setShowForm(true)} disabled={atLimit}>
            <Plus size={16} /> {t('Add station', language)}
          </button>
        )}
      </section>

      <div className="usage-card">
        <div>
          <span className="eyebrow">{t('Station capacity', language)}</span>
          <strong>{stations.length} {t('of', language)} {stationLimit}</strong>
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
                <small>{t(station.status, language)}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && !atLimit && (
        <form className="station-form-card" onSubmit={submit}>
          <div className="form-card-heading">
            <div>
              <span className="eyebrow">{t('Station configuration', language)}</span>
              <h3>{t(stations.length === 0 ? 'Tell us where your station is' : 'Add another station', language)}</h3>
            </div>
            {stations.length > 0 && (
              <button className="text-button" type="button" onClick={() => setShowForm(false)}>{t('Cancel', language)}</button>
            )}
          </div>

          {formError && <div className="alert error compact"><CircleAlert size={17} /><span>{formError}</span></div>}

          <div className="station-layout">
            <div className="station-form-fields">
              <label className="field">
                <span>{t('Station name', language)}</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder={t('e.g. North Field', language)}
                  autoFocus
                />
                {fieldErrors.name && <small className="field-error">{t(fieldErrors.name, language)}</small>}
              </label>

              <label className="field">
                <span>{t('Site', language)}</span>
                <select value={draft.siteId} onChange={(event) => setDraft({ ...draft, siteId: event.target.value })}>
                  {sites.map((site) => <option value={site.id} key={site.id}>{t(site.name, language)}</option>)}
                </select>
                <small>{t('Every new account already has a Default Site.', language)}</small>
              </label>

              <div className="field">
                <span>{t('Find location', language)}</span>
                <AddressSearch
                  language={language}
                  onSelect={(location) =>
                    setDraft((current) => ({
                      ...current,
                      latitude: location.latitude.toFixed(6),
                      longitude: location.longitude.toFixed(6),
                    }))
                  }
                />
                <small>{t('Search, enter coordinates, or click the map.', language)}</small>
              </div>

              <div className="coordinate-grid">
                <label className="field">
                  <span>{t('Latitude', language)}</span>
                  <input
                    inputMode="decimal"
                    value={draft.latitude}
                    onChange={(event) => setDraft({ ...draft, latitude: event.target.value })}
                    placeholder="40.123456"
                  />
                  {fieldErrors.latitude && <small className="field-error">{t(fieldErrors.latitude, language)}</small>}
                </label>
                <label className="field">
                  <span>{t('Longitude', language)}</span>
                  <input
                    inputMode="decimal"
                    value={draft.longitude}
                    onChange={(event) => setDraft({ ...draft, longitude: event.target.value })}
                    placeholder="-96.123456"
                  />
                  {fieldErrors.longitude && <small className="field-error">{t(fieldErrors.longitude, language)}</small>}
                </label>
              </div>

              <button className="primary-button wide" type="submit" disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}
                {t(submitting ? 'Saving station…' : 'Save station', language)}
              </button>
            </div>

            <div className="map-card">
              <MapPicker
                language={language}
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
              <div className="map-caption"><MapPin size={15} /> {t('Click or drag the pin to place the station.', language)}</div>
            </div>
          </div>
        </form>
      )}

      {atLimit && (
        <div className="alert neutral">
          <CheckCircle2 size={18} />
          <div><strong>{t('Station capacity reached', language)}</strong><span>{language === 'es' ? `Tu plan permite ${stationLimit} estaciones.` : `Your current plan allows ${stationLimit} station${stationLimit === 1 ? '' : 's'}.`}</span></div>
        </div>
      )}
    </>
  );
}

export default App;
