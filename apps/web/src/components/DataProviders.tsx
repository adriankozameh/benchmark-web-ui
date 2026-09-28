import { FormEvent, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, Plus, RadioTower, Trash2 } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { DataProvider, Plan, ProviderDeletionPreview, ProviderConnectionResult, ProviderCredentials, UserLanguage, WeatherStation } from '@benchmark/domain';
import { errorMessage, t } from '../language';

type CredentialField = keyof ProviderCredentials;
const FIELDS: { key: CredentialField; label: string; flag: keyof DataProvider }[] = [
  { key: 'apiKey', label: 'API key', flag: 'apiKeyConfigured' },
  { key: 'apiKeySecret', label: 'API key secret', flag: 'apiKeySecretConfigured' },
  { key: 'username', label: 'Username', flag: 'usernameConfigured' },
  { key: 'password', label: 'Password', flag: 'passwordConfigured' },
  { key: 'token', label: 'Access token', flag: 'tokenConfigured' },
];
const PROVIDERS: { id: string; label: string; fields: CredentialField[] }[] = [
  { id: 'WEATHER_LINK', label: 'WeatherLink', fields: ['apiKey', 'apiKeySecret'] },
  { id: 'AMBIENT_WEATHER', label: 'Ambient Weather', fields: ['apiKey'] },
  { id: 'TEMPEST', label: 'Tempest', fields: ['token'] },
  { id: 'SENSECAP_GLOBAL', label: 'SenseCAP Global', fields: ['apiKey', 'apiKeySecret'] },
  { id: 'SENSECAP_CHINA', label: 'SenseCAP China', fields: ['apiKey', 'apiKeySecret'] },
  { id: 'METOS', label: 'METOS', fields: ['apiKey', 'apiKeySecret'] },
  { id: 'ZEUS', label: 'Zeus', fields: ['username', 'password'] },
  { id: 'RANCH_SYSTEM', label: 'Ranch System', fields: ['username', 'password'] },
  { id: 'FAWN', label: 'FAWN', fields: [] },
];
const emptyCredentials = (): Record<CredentialField, string> => ({ apiKey: '', apiKeySecret: '', username: '', password: '', token: '' });
const connectionAccepted = (result: ProviderConnectionResult) => ['CONNECTED', 'NO_AUTH_REQUIRED'].includes(result.status);

type Props = {
  api: BenchmarkApi;
  organizationId: string;
  organizationRole: string;
  plan: Plan;
  language: UserLanguage;
  stations: WeatherStation[];
  onUnauthorized: () => void;
  onProviderDeleted: (providerId: string) => void;
};

export function DataProviders({ api, organizationId, organizationRole, plan, language, stations, onUnauthorized, onProviderDeleted }: Props) {
  const canManage = plan === 'PREMIUM' && ['OWNER', 'ADMIN'].includes(organizationRole);
  const [providers, setProviders] = useState<DataProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<DataProvider | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DataProvider | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ProviderConnectionResult>>({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (plan !== 'PREMIUM') { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(null);
    void api.listDataProviders(organizationId).then(items => { if (active) setProviders(items); })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
        else setError(errorMessage(cause, language));
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, organizationId, plan, language, onUnauthorized, reload]);

  async function testConnection(provider: DataProvider) {
    setTesting(provider.id);
    setError(null);
    setResults(current => { const next = { ...current }; delete next[provider.id]; return next; });
    try {
      const result = await api.testDataProvider(organizationId, provider.id);
      setResults(current => ({ ...current, [provider.id]: result }));
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(errorMessage(cause, language));
    } finally { setTesting(null); }
  }

  if (plan !== 'PREMIUM') return <section className="station-form-card">
    <h2>{t('Data providers', language)}</h2>
    <p>{t('Weather station hardware setup is available on the PREMIUM plan.', language)}</p>
  </section>;

  return <section className="data-providers">
    <div className="form-card-heading">
      <div><h2>{t('Provider accounts', language)}</h2>
        <p className="muted">{t('Create one account for your organization and reuse it across stations.', language)}</p></div>
      {canManage && <button className="primary-button" disabled={editor !== null || testing !== null || deleting !== null} type="button"
        onClick={() => { setEditor('new'); setNotice(null); }}><Plus size={17} />{t('Add provider', language)}</button>}
    </div>
    {!canManage && <p>{t('Only organization Owners and Admins can manage provider accounts.', language)}</p>}
    {error && <div className="alert error" role="alert"><CircleAlert size={18} />{error}
      <button className="text-button" type="button" onClick={() => setReload(value => value + 1)}>{t('Refresh', language)}</button></div>}
    {notice && <div className="alert neutral" role="status"><CheckCircle2 size={18} />{t(notice, language)}</div>}
    {canManage && editor && <ProviderEditor key={editor === 'new' ? 'new' : editor.id} api={api}
      organizationId={organizationId} provider={editor === 'new' ? null : editor} language={language}
      onUnauthorized={onUnauthorized} onCancel={() => setEditor(null)} onSaved={(provider, validated) => {
        setProviders(current => current.some(item => item.id === provider.id)
          ? current.map(item => item.id === provider.id ? provider : item) : [...current, provider]);
        setResults(current => { const next = { ...current }; delete next[provider.id]; return next; });
        setEditor(null);
        setNotice(validated ? provider.provider === 'FAWN'
          ? 'Provider saved. FAWN uses public data; no credentials were tested.'
          : 'Provider saved. Connection validation passed.' : 'Provider account updated.');
      }} />}
    {loading ? <p role="status"><LoaderCircle className="spin" size={18} /> {t('Loading provider accounts…', language)}</p>
      : providers.length === 0 && !error && <div className="station-form-card">
        <RadioTower size={28} /><h3>{t('No provider accounts yet', language)}</h3>
        <p>{t('Add a provider here, then select it under Stations and enter each hardware station ID.', language)}</p>
      </div>}
    {deleting && <ProviderDeleteDialog api={api} organizationId={organizationId} provider={deleting}
      language={language} onUnauthorized={onUnauthorized} onCancel={() => setDeleting(null)}
      onDeleted={() => {
        setProviders(current => current.filter(item => item.id !== deleting.id));
        setResults(current => { const next = { ...current }; delete next[deleting.id]; return next; });
        onProviderDeleted(deleting.id);
        setDeleting(null);
        setNotice('Provider deleted. Linked stations were unlinked; stations and stored data were kept.');
      }} />}
    <div className="provider-grid">{providers.map(provider => {
      const linked = stations.filter(station => station.dataProviderId === provider.id);
      const result = results[provider.id];
      return <article className="station-form-card provider-card" key={provider.id}>
        <div><span className="eyebrow">{PROVIDERS.find(item => item.id === provider.provider)?.label ?? provider.provider}</span>
          <h3>{provider.name}</h3></div>
        <p>{t('Linked stations', language)}: {linked.length}</p>
        {linked.length > 0 && <ul>{linked.map(station => <li key={station.id}>{station.name} · {station.providerStationId}</li>)}</ul>}
        <p className="station-details-hint">{t('Credentials already saved:', language)}{' '}
          {FIELDS.filter(({ flag }) => provider[flag]).map(({ label }) => t(label, language)).join(', ') || t('None', language)}</p>
        {result && <div className={`alert ${connectionAccepted(result) ? 'neutral' : 'error'} compact`} role="status">
          <span>{t(result.message, language)}<small className="connection-time">{t('Checked', language)}: {new Date(result.checkedAt).toLocaleString(language)}</small></span>
        </div>}
        {canManage && <div className="station-details-actions">
          <button className="secondary-button" type="button" disabled={testing !== null || editor !== null || deleting !== null}
            onClick={() => void testConnection(provider)}>
            {testing === provider.id && <LoaderCircle className="spin" size={16} />}
            {t(testing === provider.id ? 'Testing connection…' : 'Test connection', language)}</button>
          <button className="text-button" type="button" disabled={testing !== null || editor !== null || deleting !== null}
            onClick={() => { setEditor(provider); setNotice(null); }}>{t('Edit', language)}</button>
          <button className="text-button provider-delete-button" type="button"
            disabled={testing !== null || editor !== null || deleting !== null}
            onClick={() => { setDeleting(provider); setNotice(null); setError(null); }}>
            <Trash2 size={16} />{t('Delete provider', language)}</button>
        </div>}
      </article>;
    })}</div>
  </section>;
}

function ProviderEditor({ api, organizationId, provider, language, onSaved, onCancel, onUnauthorized }: {
  api: BenchmarkApi; organizationId: string; provider: DataProvider | null; language: UserLanguage;
  onSaved: (provider: DataProvider, validated: boolean) => void; onCancel: () => void; onUnauthorized: () => void;
}) {
  const [name, setName] = useState(provider?.name ?? '');
  const [type, setType] = useState(provider?.provider ?? 'WEATHER_LINK');
  const [credentials, setCredentials] = useState(emptyCredentials);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const definition = PROVIDERS.find(item => item.id === type);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const supplied = Object.fromEntries(Object.entries(credentials).filter(([, value]) => value.trim() !== '')) as ProviderCredentials;
    try {
      const saved = provider
        ? await api.updateDataProvider(organizationId, provider.id, { name: name.trim(), ...supplied })
        : await api.createDataProvider(organizationId, { name: name.trim(), provider: type, ...supplied });
      setCredentials(emptyCredentials());
      onSaved(saved, !provider || Object.keys(supplied).length > 0);
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(errorMessage(cause, language));
    } finally { setBusy(false); }
  }

  return <form className="station-form-card provider-editor" onSubmit={event => void save(event)}>
    <h3>{t(provider ? 'Edit provider account' : 'Add provider', language)}</h3>
    {!provider && <p className="station-details-hint">{t('Account verification is not yet available for Vaisala, METER, CIMIS, Acuity, or LI-COR / HOBO.', language)}</p>}
    {error && <div className="alert error compact" role="alert">{error}</div>}
    <fieldset disabled={busy} className="provider-fields">
      <div className="station-details-grid">
        <label className="field"><span>{t('Provider account name', language)}</span>
          <input value={name} maxLength={200} required onChange={event => setName(event.target.value)} /></label>
        <label className="field"><span>{t('Hardware provider', language)}</span>
          <select value={type} disabled={provider !== null} onChange={event => { setType(event.target.value); setCredentials(emptyCredentials()); setError(null); }}>
            {!definition && <option value={type}>{type}</option>}
            {PROVIDERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
      </div>
      {!definition && <p>{t('Account-level validation is unavailable for this provider. You can edit its name.', language)}</p>}
      {provider && <p className="station-details-hint">{t('Leave credential fields blank to keep saved values.', language)}{' '}
        {t('Changing saved credentials affects every station using this provider account.', language)}</p>}
      {type === 'FAWN' && <p>{t('FAWN uses public data. No credentials are required or tested.', language)}</p>}
      <div className="station-details-grid">{FIELDS.filter(field => definition?.fields.includes(field.key)).map(field =>
        <label className="field" key={field.key}><span>{t(field.label, language)}
          {provider?.[field.flag] ? ` · ${t('Configured', language)}` : ''}</span>
          <input type="password" autoComplete="new-password" maxLength={4096} value={credentials[field.key]}
            required={!provider} onChange={event => setCredentials(current => ({ ...current, [field.key]: event.target.value }))} />
        </label>)}</div>
      <p className="station-details-hint">{t('Credentials are tested before saving. A successful test does not guarantee access to every station or historical data.', language)}</p>
      <div className="station-details-actions">
        <button className="primary-button" type="submit">{busy && <LoaderCircle className="spin" size={17} />}
          {t(busy ? 'Validating and saving…' : 'Save provider', language)}</button>
        <button className="text-button" type="button" onClick={onCancel}>{t('Cancel', language)}</button>
      </div>
    </fieldset>
  </form>;
}

function ProviderDeleteDialog({ api, organizationId, provider, language, onUnauthorized, onCancel, onDeleted }: {
  api: BenchmarkApi; organizationId: string; provider: DataProvider; language: UserLanguage;
  onUnauthorized: () => void; onCancel: () => void; onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<ProviderDeletionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPreview(null);
    void api.previewDataProviderDeletion(organizationId, provider.id).then(result => {
      if (active) setPreview(result);
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(errorMessage(cause, language));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, organizationId, provider.id, language, onUnauthorized, reload]);

  async function confirmDeletion() {
    if (!preview || loading || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.deleteDataProvider(organizationId, provider.id, preview.stations.map(station => station.id));
      onDeleted();
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else {
        setError(errorMessage(cause, language));
        // Never reuse a confirmation after a failure; fetch current links again.
        setPreview(null);
        setReload(value => value + 1);
      }
    } finally { submitting.current = false; setBusy(false); }
  }

  return <dialog ref={dialog} className="provider-delete-dialog" aria-labelledby="provider-delete-title"
    aria-describedby="provider-delete-description" onCancel={event => {
      event.preventDefault();
      if (!submitting.current) onCancel();
    }}>
    <h2 id="provider-delete-title">{t('Delete provider', language)}: {preview?.providerName ?? provider.name}</h2>
    <p id="provider-delete-description">{t('This deletes the provider account and its saved credentials. This cannot be undone.', language)}</p>
    {error && <div className="alert error compact" role="alert">{error}</div>}
    {loading && <p role="status">{t('Checking linked stations…', language)}</p>}
    {preview && <>
      {preview.stations.length > 0 ? <div className="provider-delete-warning">
        <p>{t('These stations will be unlinked from this provider:', language)}</p>
        <ul>{preview.stations.map(station => <li key={station.id}>{station.name}</li>)}</ul>
        <p>{t('New observations from this provider will stop. Link another provider to resume collection.', language)}</p>
      </div> : <p>{t('No stations are linked to this provider.', language)}</p>}
      <p>{t('Stations and their stored data will be kept.', language)}</p>
    </>}
    <div className="station-details-actions">
      <button autoFocus className="secondary-button" type="button" disabled={busy} onClick={onCancel}>{t('Cancel', language)}</button>
      {!loading && !preview && <button className="secondary-button" type="button"
        onClick={() => { setError(null); setReload(value => value + 1); }}>{t('Refresh', language)}</button>}
      <button className="primary-button provider-delete-confirm" type="button" disabled={busy || loading || !preview}
        onClick={() => void confirmDeletion()}>{busy && <LoaderCircle className="spin" size={16} />}
        {t(busy ? 'Deleting…' : preview?.stations.length ? 'Unlink stations and delete provider' : 'Delete provider', language)}</button>
    </div>
  </dialog>;
}
