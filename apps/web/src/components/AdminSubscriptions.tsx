import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Building2, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { AdminEntitlements, AdminOrganization, AdminSubscription, PageResponse, UserLanguage } from '@benchmark/domain';
import { errorMessage, locale, t } from '../language';
import { billingAccess, grantDraft, grantInput, minimumGrantLimits, validateGrant, type GrantDraft } from './subscriptionGrantRules';
import { CreateAdminOrganization } from './CreateAdminOrganization';
import { AdminOrganizationMembers } from './AdminOrganizationMembers';
import './admin.css';

type Props = {
  api: BenchmarkApi;
  language: UserLanguage;
  onUnauthorized: () => void;
  onChanged: () => Promise<void>;
};

export function AdminSubscriptions({ api, language, onUnauthorized, onChanged }: Props) {
  const [page, setPage] = useState(0);
  const [directory, setDirectory] = useState<PageResponse<AdminOrganization> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [denied, setDenied] = useState(false);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [detailsRevision, setDetailsRevision] = useState(0);
  const [peopleRevision, setPeopleRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createdOrganization, setCreatedOrganization] = useState<AdminOrganization | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const accessPanel = useRef<HTMLDivElement>(null);
  const onMembersChanged = useCallback(() => setDetailsRevision(value => value + 1), []);
  const onForbidden = useCallback(() => {
    setDenied(true);
    setDirectory(null);
    setSelectedId(null);
  }, []);

  useEffect(() => {
    if (denied) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void api.listAdminOrganizations(page, 25, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.totalPages > 0 && page >= result.totalPages) {
        setPage(result.totalPages - 1);
        return;
      }
      setDirectory(result);
      setSelectedId(current => result.items.some(item => item.id === current) || current === createdOrganization?.id
        ? current : result.items[0]?.id ?? null);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof BenchmarkApiError && cause.status === 403) onForbidden();
      else setError(cause);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, page, directoryRevision, denied, onUnauthorized, onForbidden, createdOrganization?.id]);

  const selected = directory?.items.find(item => item.id === selectedId)
    ?? (createdOrganization?.id === selectedId ? createdOrganization : null);
  if (denied) return <div className="alert error" role="alert"><CircleAlert size={18} />
    <span>{t('Only platform SUPERADMIN users can access this page.', language)}</span></div>;

  function created(organization: AdminOrganization) {
    setCreating(false);
    setCreatedOrganization(organization);
    setSelectedId(organization.id);
    setPage(Math.floor((directory?.totalElements ?? 0) / 25));
    setDirectoryRevision(value => value + 1);
    setNotice('Organization created with you as its initial owner.');
    void onChanged();
  }

  return <section className="admin-subscriptions" aria-label={t('Organization administration', language)}>
    <div className="page-heading-row">
      <div><h2>{t('Organization administration', language)}</h2>
        <p>{t('Create organizations, manage subscription access, and hand ownership to your customers.', language)}</p></div>
      <div className="admin-heading-actions"><button type="button" className="secondary-button" disabled={busy || loading} onClick={() => {
        setDirectoryRevision(value => value + 1);
        setDetailsRevision(value => value + 1);
        setPeopleRevision(value => value + 1);
      }}><RefreshCw size={16} />{t('Refresh', language)}</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => setCreating(true)}>
          <Plus size={16} />{t('Create organization', language)}</button></div>
    </div>
    <div className="admin-intro"><ShieldCheck size={20} /><p>{t('Complimentary access takes effect immediately and lasts until revoked. Billing continues according to the existing subscription.', language)}</p></div>
    {error !== null && <div className="alert error" role="alert"><CircleAlert size={18} />
      <span>{errorMessage(error, language)}</span></div>}
    {notice && <div className="alert neutral" role="status"><Building2 size={17} /><span>{t(notice, language)}</span></div>}
    <div className="admin-layout">
      <section className="admin-directory" aria-labelledby="admin-organizations-title" aria-busy={loading}>
        <div className="admin-directory-heading"><h3 id="admin-organizations-title">{t('Organizations', language)}</h3>
          {directory && <span>{new Intl.NumberFormat(locale(language)).format(directory.totalElements)}</span>}</div>
        {loading && <p className="admin-loading" role="status"><LoaderCircle className="spin" size={16} />{t('Loading organizations…', language)}</p>}
        {!loading && directory?.items.length === 0 && <p className="admin-empty">{t('No organizations found.', language)}</p>}
        <div className="admin-organization-list">
          {createdOrganization && !directory?.items.some(item => item.id === createdOrganization.id) && <button type="button"
            className={`admin-organization ${createdOrganization.id === selectedId ? 'selected' : ''}`}
            aria-pressed={createdOrganization.id === selectedId} disabled={busy || loading} onClick={() => setSelectedId(createdOrganization.id)}>
            <Building2 size={17} /><span><strong>{createdOrganization.name}</strong><small>{t('New organization', language)}</small></span><ChevronRight size={16} />
          </button>}
          {directory?.items.map(organization => <button type="button" key={organization.id}
            className={`admin-organization ${organization.id === selectedId ? 'selected' : ''}`}
            aria-pressed={organization.id === selectedId} disabled={busy || loading}
            onClick={() => { setCreatedOrganization(null); setSelectedId(organization.id); }}>
            <Building2 size={17} /><span><strong>{organization.name}</strong>
              <small>{t(organization.status, language)} · {t(organization.type, language)}</small></span><ChevronRight size={16} />
          </button>)}
        </div>
        {directory && directory.totalPages > 1 && <nav className="admin-pagination" aria-label={t('Organization pages', language)}>
          <button type="button" className="icon-button" aria-label={t('Previous page', language)} disabled={busy || loading || page === 0}
            onClick={() => { setCreatedOrganization(null); setPage(value => value - 1); }}><ChevronLeft size={17} /></button>
          <span>{t('Page {page} of {pages}', language).replace('{page}', String(page + 1)).replace('{pages}', String(directory.totalPages))}</span>
          <button type="button" className="icon-button" aria-label={t('Next page', language)} disabled={busy || loading || page + 1 >= directory.totalPages}
            onClick={() => { setCreatedOrganization(null); setPage(value => value + 1); }}><ChevronRight size={17} /></button>
        </nav>}
      </section>
      {selected ? <div className="admin-organization-panels" key={selected.id}>
        <div ref={accessPanel}><SubscriptionDetails api={api} organization={selected} language={language} blocked={busy}
        revision={detailsRevision} onUnauthorized={onUnauthorized} onForbidden={onForbidden} onBusy={setBusy}
        onChanged={onChanged} onSaved={() => { setDirectoryRevision(value => value + 1); setPeopleRevision(value => value + 1); }} /></div>
        <AdminOrganizationMembers api={api} organization={selected} language={language} revision={peopleRevision} blocked={busy}
          onBusy={setBusy} onUnauthorized={onUnauthorized} onForbidden={onForbidden} onChanged={onChanged}
          onMembershipChanged={onMembersChanged} onManageAccess={() => accessPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      </div>
        : <div className="admin-selection"><Building2 size={28} /><p>{t('Select an organization to manage its access.', language)}</p></div>}
    </div>
    {creating && <CreateAdminOrganization api={api} language={language} onCreated={created} onClose={() => setCreating(false)}
      onBusy={setBusy} onUnauthorized={onUnauthorized} onForbidden={onForbidden} />}
  </section>;
}

type DetailsProps = Props & {
  organization: AdminOrganization;
  revision: number;
  onForbidden: () => void;
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
  blocked: boolean;
};

function SubscriptionDetails({ api, organization, language, revision, blocked, onUnauthorized, onForbidden, onBusy, onChanged, onSaved }: DetailsProps) {
  const [subscription, setSubscription] = useState<AdminSubscription | null>(null);
  const [entitlements, setEntitlements] = useState<AdminEntitlements | null>(null);
  const [draft, setDraft] = useState<GrantDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [permissionsUnavailable, setPermissionsUnavailable] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (inFlight.current) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setValidation(null);
    setNotice(null);
    setConfirmRevoke(false);
    setPermissionsUnavailable(false);
    void Promise.all([
      api.getAdminSubscription(organization.id, controller.signal),
      api.getAdminEntitlements(organization.id, controller.signal),
    ]).then(([nextSubscription, nextEntitlements]) => {
      if (controller.signal.aborted) return;
      setSubscription(nextSubscription);
      setEntitlements(nextEntitlements);
      setDraft(grantDraft(nextSubscription));
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof BenchmarkApiError && cause.status === 403) onForbidden();
      else { setSubscription(null); setDraft(null); setError(cause); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, organization.id, revision, onUnauthorized, onForbidden]);

  useEffect(() => {
    if (confirmRevoke) dialog.current?.showModal();
    return () => dialog.current?.close();
  }, [confirmRevoke]);

  function cancelRevoke() {
    if (!inFlight.current) setConfirmRevoke(false);
  }

  async function mutate(revoke: boolean) {
    if (!subscription || !draft || loading || blocked || inFlight.current) return;
    const invalid = revoke ? null : validateGrant(draft, subscription);
    setValidation(invalid);
    setError(null);
    setNotice(null);
    if (invalid) return;
    inFlight.current = true;
    setSaving(true);
    onBusy(true);
    try {
      const next = revoke
        ? await api.revokeSubscriptionGrant(organization.id)
        : await api.saveSubscriptionGrant(organization.id, grantInput(draft));
      if (mounted.current) {
        setSubscription(next);
        setDraft(grantDraft(next));
        setEntitlements(null);
        setPermissionsUnavailable(false);
        setConfirmRevoke(false);
        setNotice(revoke ? 'Subscription grant revoked.' : 'Subscription access saved.');
        onSaved();
      }
      // A successful mutation stays successful if a subsequent read fails.
      const results = await Promise.allSettled([api.getAdminEntitlements(organization.id), onChanged()]);
      if (mounted.current) {
        const permissions = results[0];
        if (permissions.status === 'fulfilled') setEntitlements(permissions.value);
        else if (permissions.reason instanceof BenchmarkApiError && permissions.reason.status === 401) onUnauthorized();
        else if (permissions.reason instanceof BenchmarkApiError && permissions.reason.status === 403) onForbidden();
        else setPermissionsUnavailable(true);
      }
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof BenchmarkApiError && cause.status === 403) onForbidden();
      else setError(cause);
    } finally {
      inFlight.current = false;
      onBusy(false);
      if (mounted.current) setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void mutate(false);
  }

  const restored = subscription ? billingAccess(subscription) : null;
  const canRevoke = subscription && restored && restored.seats >= subscription.usage.seatsUsed
    && restored.stations >= subscription.usage.stationsUsed;
  const minimum = subscription ? minimumGrantLimits(subscription) : null;
  const field = (change: Partial<GrantDraft>) => setDraft(current => current ? { ...current, ...change } : current);

  return <section className="admin-details" aria-labelledby="admin-organization-title" aria-busy={loading}>
    <div className="admin-details-heading"><div><span className="eyebrow">{t('Organization', language)}</span>
      <h3 id="admin-organization-title">{organization.name}</h3><code>{organization.id}</code></div>
      <span className={`admin-status ${organization.status.toLowerCase()}`}>{t(organization.status, language)}</span></div>
    {organization.status === 'CLOSED' || organization.statusReason === 'ADMINISTRATIVE'
      ? <div className="admin-explanation">{t('Access grants preserve closures and administrative suspensions.', language)}</div> : null}
    {loading && <p className="admin-loading" role="status"><LoaderCircle className="spin" size={16} />{t('Loading subscription…', language)}</p>}
    {error !== null && <div className="alert error" role="alert"><CircleAlert size={18} /><span>{errorMessage(error, language)}</span></div>}
    {validation && <div className="alert error" role="alert"><CircleAlert size={18} /><span>{t(validation, language)}</span></div>}
    {notice && <div className="alert neutral" role="status"><ShieldCheck size={18} /><span>{t(notice, language)}</span></div>}
    {permissionsUnavailable && <p role="status">{t('Access was saved. Refresh this view to reload permissions.', language)}</p>}
    {!loading && subscription && draft && minimum && <>
      <div className="admin-summary">
        <div className="admin-summary-card"><span>{t('Billing subscription', language)}</span>
          <strong className={`plan-pill ${subscription.billing.plan.toLowerCase()}`}>{t(subscription.billing.plan, language)}</strong>
          <small>{t(subscription.billing.status, language)} · {t(subscription.billing.stripeBacked ? 'Stripe customer linked' : 'No Stripe customer', language)}</small></div>
        <div className="admin-summary-card"><span>{t('Effective access', language)}</span>
          <strong className={`plan-pill ${subscription.effective.plan.toLowerCase()}`}>{t(subscription.effective.plan, language)}</strong>
          <small>{t(subscription.override ? 'Complimentary grant active' : 'From billing subscription', language)}</small></div>
        <div className="admin-summary-card"><span>{t('Users', language)}</span>
          <strong>{subscription.usage.seatsUsed} / {subscription.effective.seatLimit}</strong><small>{t('Used / total allowed', language)}</small></div>
        <div className="admin-summary-card"><span>{t('Stations', language)}</span>
          <strong>{subscription.usage.stationsUsed} / {subscription.effective.stationLimit}</strong><small>{t('Used / total allowed', language)}</small></div>
      </div>
      <form className="admin-grant-form" onSubmit={submit}>
        <h4>{t(subscription.override ? 'Update subscription grant' : 'Grant subscription access', language)}</h4>
        <p>{t('Set total limits, including existing users and stations. The account owner counts as a user.', language)}</p>
        <fieldset disabled={saving || blocked}>
          <div className="admin-grant-fields">
            <label className="field"><span>{t('Plan', language)}</span>
              <select aria-label={t('Plan', language)} value={draft.plan} onChange={event => {
                const plan = event.target.value as GrantDraft['plan'];
                field({ plan, seats: String(Math.max(Number(draft.seats) || minimum.seats, plan === 'PREMIUM' ? 10 : minimum.seats)) });
              }}>
                <option value="PRO" disabled={subscription.billing.plan === 'PREMIUM'}>PRO</option>
                <option value="PREMIUM">PREMIUM</option>
              </select></label>
            <label className="field"><span>{t('Total users allowed', language)}</span>
              <input type="number" required min={minimum.seats} max={2147483647} step="1" value={draft.seats} onChange={event => field({ seats: event.target.value })} /></label>
            <label className="field"><span>{t('Total stations allowed', language)}</span>
              <input type="number" required min={minimum.stations} max={2147483647} step="1" value={draft.stations} onChange={event => field({ stations: event.target.value })} /></label>
          </div>
          <label className="field"><span>{t('Reason for grant', language)}</span>
            <textarea rows={3} required maxLength={500} value={draft.reason} onChange={event => field({ reason: event.target.value })} /></label>
          <div className="admin-grant-footer"><span>{t('Saving a grant creates no Stripe charge.', language)}</span>
            <button type="submit" className="primary-button">{saving ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
              {t(subscription.override ? 'Save grant' : 'Grant access', language)}</button></div>
        </fieldset>
      </form>
      {subscription.override && <div className="admin-revoke">
        <div><strong>{t('Current grant', language)}</strong><p>{subscription.override.reason}</p>
          <small>{t('Last updated', language)}: {new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(subscription.override.updatedAt))}</small>
          {!canRevoke && <p>{t('Reduce member or station counts to the billing plan limits before revoking this grant.', language)}</p>}</div>
        <button type="button" className="secondary-button" disabled={saving || blocked || !canRevoke} onClick={() => { setError(null); setConfirmRevoke(true); }}>
          <Trash2 size={16} />{t('Revoke grant', language)}</button>
      </div>}
      <details className="admin-entitlements"><summary>{t('Active permissions', language)}{entitlements ? ` (${entitlements.activeEntitlements.length})` : ''}</summary>
        {entitlements ? <ul>{[...entitlements.activeEntitlements].sort().map(entitlement => <li key={entitlement}>{entitlement}</li>)}</ul>
          : <p>{t(permissionsUnavailable ? 'Refresh to reload permissions.' : 'Loading permissions…', language)}</p>}</details>
    </>}
    {confirmRevoke && restored && <dialog ref={dialog} className="station-delete-dialog admin-revoke-dialog" aria-labelledby="admin-revoke-title"
      aria-describedby="admin-revoke-description" onCancel={event => { event.preventDefault(); cancelRevoke(); }}>
      <h2 id="admin-revoke-title">{t('Revoke subscription grant?', language)}</h2>
      <p id="admin-revoke-description">{t('This restores access according to the billing subscription. An expired FREE trial will be suspended.', language)}</p>
      <p><strong>{organization.name}</strong> · {t(restored.plan, language)} · {t('{users} users and {stations} stations', language).replace('{users}', String(restored.seats)).replace('{stations}', String(restored.stations))}</p>
      {error !== null && <div className="alert error" role="alert">{errorMessage(error, language)}</div>}
      <div className="admin-dialog-actions"><button type="button" className="secondary-button" autoFocus disabled={saving} onClick={cancelRevoke}>{t('Cancel', language)}</button>
        <button type="button" className="primary-button station-delete-confirm" disabled={saving || blocked} onClick={() => { void mutate(true); }}>
          {saving && <LoaderCircle className="spin" size={16} />}{t('Revoke grant', language)}</button></div>
    </dialog>}
  </section>;
}
