import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CircleAlert, LoaderCircle, MailPlus, RefreshCw } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { OrganizationInvitation, UserLanguage } from '@benchmark/domain';
import { errorMessage, locale, t } from '../language';

export function OrganizationInvitations({ api, organizationId, organizationRole, seatLimit, language, onUnauthorized, membershipRevision }: {
  api: BenchmarkApi;
  organizationId: string;
  organizationRole: string;
  seatLimit: number;
  membershipRevision: number;
  language: UserLanguage;
  onUnauthorized: () => void;
}) {
  const [seatsUsed, setSeatsUsed] = useState<number | null>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [capacityRevision, setCapacityRevision] = useState(0);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const canInvite = organizationRole === 'OWNER' || organizationRole === 'ADMIN';

  const atSeatLimit = seatsUsed !== null && seatsUsed >= seatLimit;
  const invitationUnavailable = !canInvite || seatsUsed === null || atSeatLimit;

  useEffect(() => {
    if (!canInvite) return;
    let active = true;
    let requestId = 0;
    async function refreshCapacity() {
      const currentRequest = ++requestId;
      setSeatsUsed(null);
      setCapacityError(null);
      try {
        const members = await api.listMembers(organizationId);
        if (active && currentRequest === requestId) setSeatsUsed(members.length);
      } catch (cause) {
        if (!active || currentRequest !== requestId) return;
        if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
        else setCapacityError(errorMessage(cause, language));
      }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshCapacity(); };
    void refreshCapacity();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, organizationId, canInvite, seatLimit, membershipRevision, capacityRevision, onUnauthorized, language]);

  const activeInvitations = invitations.filter(invitation =>
    invitation.status === 'PENDING' && Date.parse(invitation.expiresAt) > now);

  const expiredInvitations = invitations.filter(invitation =>
    invitation.status === 'EXPIRED' ||
    (invitation.status === 'PENDING' && Date.parse(invitation.expiresAt) <= now))
    .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt));

  // Move invitations into history when they expire, even while the page stays open.
  useEffect(() => {
    const expirations = invitations.filter(invitation => invitation.status === 'PENDING')
      .map(invitation => Date.parse(invitation.expiresAt)).filter(expiration => expiration > now);
    if (expirations.length === 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()),
      Math.min(Math.max(0, Math.min(...expirations) - Date.now()), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [invitations, now]);

  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', updateClock);
    return () => {
      window.removeEventListener('focus', updateClock);
      document.removeEventListener('visibilitychange', updateClock);
    };
  }, []);

  async function revoke(invitationId: string) {
    await api.revokeInvitation(organizationId, invitationId);
    // Keep the successful removal visible even if the subsequent refresh fails.
    setInvitations(current => current.filter(invitation => invitation.id !== invitationId));
  }

  async function refreshDelivery() {
    setCapacityRevision(value => value + 1);
    setLoading(true);
    setError(null);
    try {
      setInvitations(await api.listInvitations(organizationId));
      setNow(Date.now());
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(errorMessage(cause, language));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canInvite) return;
    let active = true;
    setLoading(true);
    setError(null);
    void api.listInvitations(organizationId).then((rows) => {
      if (active) { setInvitations(rows); setNow(Date.now()); }
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(errorMessage(cause, language));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, organizationId, canInvite, onUnauthorized, language]);

  async function perform(key: string, action: () => Promise<{ localPreviewUrl: string | null } | void>, message: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    setPreviewUrl(null);
    try {
      const result = await action();
      setInvitations(await api.listInvitations(organizationId));
      setNow(Date.now());
      if (result?.localPreviewUrl) setPreviewUrl(result.localPreviewUrl);
      setNotice(message);
      return true;
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(errorMessage(cause, language));
      return false;
    } finally {
      setCapacityRevision(value => value + 1);
      setBusy(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || invitationUnavailable) return;
    const created = await perform('new', () => api.inviteUser(organizationId, email.trim(), role),
      t('Invitation created. Email delivery may take a moment.', language));
    if (created) setEmail('');
  }

  return <>
    {canInvite && <>
      <div className="usage-card" aria-live="polite">
        <div><span className="eyebrow">{t('Seat capacity', language)}</span>
          <strong>{seatsUsed === null ? t(capacityError ? 'Seat capacity unavailable' : 'Checking seat capacity…', language) : <>{seatsUsed} {t('of', language)} {seatLimit}</>}</strong>
        </div>
        <div className="usage-track"><span style={{ width: `${Math.min(100, ((seatsUsed ?? 0) / Math.max(1, seatLimit)) * 100)}%` }} /></div>
      </div>
      {atSeatLimit && <div className="alert neutral" role="status">
        <CircleAlert size={18} />
        <div><strong>{t('Seat capacity reached', language)}</strong>
          <span>{language === 'es' ? `Tu plan permite ${seatLimit} ${seatLimit === 1 ? 'asiento' : 'asientos'}.`
            : `Your current plan allows ${seatLimit} seat${seatLimit === 1 ? '' : 's'}.`}</span>
          <span>{t('Remove a member or increase your seat limit to invite more people.', language)}</span>
        </div>
      </div>}
      {capacityError && <div className="alert error compact" role="alert">
        <CircleAlert size={17} /><span>{t('Unable to check seat capacity. Invitations are unavailable until capacity can be checked.', language)} {capacityError}</span>
        <button type="button" className="text-button" onClick={() => setCapacityRevision(value => value + 1)}>{t('Retry', language)}</button>
      </div>}
    </>}
    <section className="station-form-card organization-invitations">
    <h2>{t('Invite people', language)}</h2>
    {!canInvite ? <p>{t('Only organization owners and admins can manage invitations.', language)}</p> : <>
      <p>{t('Invite someone to join your organization using their email address.', language)}{' '}
        {t('Seat limit:', language)} {seatLimit}.</p>
      <form className="invitation-form" onSubmit={(event) => { void submit(event); }}>
        <label className="field"><span>{t('Email address', language)}</span>
          <input required type="email" autoComplete="email" maxLength={320} value={email}
            onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
        </label>
        <label className="field"><span>{t('Role', language)}</span>
          <select value={role} onChange={(event) => setRole(event.target.value as 'MEMBER' | 'ADMIN')}>
            <option value="MEMBER">{t('Member', language)}</option>
            {organizationRole === 'OWNER' && <option value="ADMIN">{t('Admin', language)}</option>}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={busy !== null || invitationUnavailable}>
          {busy === 'new' ? <LoaderCircle className="spin" size={16} /> : <MailPlus size={16} />}
          {t('Send invitation', language)}
        </button>
      </form>
      {error && <div className="alert error compact"><CircleAlert size={17} /><span>{error}</span></div>}
      {notice && <p role="status" className="invitation-notice">{notice}</p>}
      {previewUrl && <p className="invitation-notice">{t('Local preview link:', language)} <a href={previewUrl}>{previewUrl}</a></p>}
      <div className="invitation-list-heading"><h3>{t('Invitations', language)}</h3>
        <button type="button" className="secondary-button" disabled={loading || busy !== null}
          onClick={() => { void refreshDelivery(); }}><RefreshCw size={15} />{t('Refresh delivery status', language)}</button>
      </div>
      {loading ? <p><LoaderCircle className="spin" size={16} /> {t('Loading invitations…', language)}</p>
        : activeInvitations.length === 0 ? <p>{t('No active invitations.', language)}</p>
          : <div className="invitation-list">{activeInvitations.map((invitation) => <div key={invitation.id} className="invitation-row">
            <div><strong>{invitation.email}</strong><span>{t(invitation.role === 'ADMIN' ? 'Admin' : 'Member', language)} · {t(invitation.status, language)} · {t('Expires', language)} {new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium' }).format(new Date(invitation.expiresAt))}</span>
              <span>{t('Email:', language)} {t(invitation.deliveryStatus === 'SENT' ? 'Accepted by email provider'
                : invitation.deliveryStatus === 'FAILED' ? 'Delivery failed' : 'Sending pending', language)}</span>
              {invitation.deliveryStatus === 'FAILED' && <span>{t('Email delivery failed. Resend the invitation.', language)}</span>}
            </div>
            <div className="invitation-actions">
              <button type="button" className="secondary-button" disabled={busy !== null || invitationUnavailable}
                onClick={() => { void perform(invitation.id, () => api.resendInvitation(organizationId, invitation.id),
                  t('Invitation resent.', language)); }}>{t('Resend', language)}</button>
              <button type="button" className="text-button" disabled={busy !== null}
                onClick={() => { void perform(invitation.id, () => revoke(invitation.id),
                  t('Invitation revoked.', language)); }}>{t('Revoke', language)}</button>
            </div>
          </div>)}</div>}
      {!loading && expiredInvitations.length > 0 && <section className="invitation-history"
        aria-label={t('Expired invitations', language)}>
        <h3>{t('Expired invitations', language)}</h3>
        <p className="muted">{t('These invitations have expired. Resend an invitation to make it available again.', language)}</p>
        <div className="invitation-list">{expiredInvitations.map(invitation =>
          <div key={invitation.id} className="invitation-row">
            <div><strong>{invitation.email}</strong>
              <span>{t(invitation.role === 'ADMIN' ? 'Admin' : 'Member', language)} · {t('EXPIRED', language)} · {new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium' }).format(new Date(invitation.expiresAt))}</span>
              <span>{t('Email:', language)} {t(invitation.deliveryStatus === 'SENT' ? 'Accepted by email provider'
                : invitation.deliveryStatus === 'FAILED' ? 'Delivery failed' : 'Sending pending', language)}</span>
            </div>
            <div className="invitation-actions">
              <button type="button" className="secondary-button" disabled={busy !== null || invitationUnavailable}
                onClick={() => { void perform(invitation.id, () => api.resendInvitation(organizationId, invitation.id),
                  t('Invitation resent.', language)); }}>{t('Resend', language)}</button>
            </div>
          </div>)}</div>
      </section>}
    </>}
  </section></>;
}
