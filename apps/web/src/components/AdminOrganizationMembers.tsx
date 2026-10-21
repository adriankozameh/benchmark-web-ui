import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { AdminOrganization, AdminSubscription, OrganizationMember, UserLanguage } from '@benchmark/domain';
import { errorMessage, t } from '../language';
import { OrganizationInvitations } from './OrganizationInvitations';

type Props = {
  api: BenchmarkApi;
  organization: AdminOrganization;
  language: UserLanguage;
  revision: number;
  blocked: boolean;
  onBusy: (busy: boolean) => void;
  onUnauthorized: () => void;
  onForbidden: () => void;
  onChanged: () => Promise<void>;
  onMembershipChanged: () => void;
  onManageAccess: () => void;
};

type Snapshot = { members: OrganizationMember[]; subscription: AdminSubscription };

export function AdminOrganizationMembers({ api, organization, language, revision, blocked, onBusy, onUnauthorized,
  onForbidden, onChanged, onMembershipChanged, onManageAccess }: Props) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [reload, setReload] = useState(0);
  const [membershipRevision, setMembershipRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [target, setTarget] = useState<OrganizationMember | null>(null);
  const fingerprint = useRef<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    setLoadError(null);
    void Promise.all([
      api.listMembers(organization.id, controller.signal),
      api.getAdminSubscription(organization.id, controller.signal),
    ]).then(([members, subscription]) => {
      if (controller.signal.aborted) return;
      const next = JSON.stringify(members.map(member => [member.userId, member.role, member.joinedAt]));
      if (fingerprint.current !== null && next !== fingerprint.current) {
        setMembershipRevision(value => value + 1);
        onMembershipChanged();
      }
      fingerprint.current = next;
      setData({ members, subscription });
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof BenchmarkApiError && cause.status === 403) onForbidden();
      else setLoadError(cause);
    }).finally(() => { if (!controller.signal.aborted) setRefreshing(false); });
    return () => controller.abort();
  }, [api, organization.id, revision, reload, onUnauthorized, onForbidden, onMembershipChanged]);

  // A customer accepts in another session. Refresh joined members while this page is visible.
  useEffect(() => {
    const refresh = () => {
      if (!blocked && !inFlight.current && document.visibilityState === 'visible') setReload(value => value + 1);
    };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [blocked]);

  useEffect(() => {
    if (target) dialog.current?.showModal();
    return () => dialog.current?.close();
  }, [target]);

  const owners = data?.members.filter(member => member.role === 'OWNER') ?? [];
  const eligible = data?.members.filter(member => member.role !== 'OWNER') ?? [];
  const canTransfer = owners.length === 1 && loadError === null;

  function cancel() {
    if (!inFlight.current) { setTarget(null); setActionError(null); }
  }

  async function transfer() {
    if (!target || !canTransfer || refreshing || blocked || inFlight.current
        || !eligible.some(member => member.userId === target.userId)) return;
    inFlight.current = true;
    setSaving(true);
    setActionError(null);
    setNotice(null);
    onBusy(true);
    try {
      await api.transferOrganizationOwnership(organization.id, target.userId);
      if (mounted.current) {
        setTarget(null);
        setNotice('Organization ownership transferred.');
        setReload(value => value + 1);
      }
      await onChanged();
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof BenchmarkApiError && cause.status === 403) onForbidden();
      else setActionError(cause);
    } finally {
      inFlight.current = false;
      onBusy(false);
      if (mounted.current) setSaving(false);
    }
  }

  return <div className="admin-people">
    <section className="admin-details admin-members" aria-labelledby="admin-members-title" aria-busy={refreshing}>
      <div className="admin-members-heading"><div><h3 id="admin-members-title">{t('Members and ownership', language)}</h3>
        <p>{t('Invite the future owner as a member. Ownership can be transferred only after they accept and join.', language)}</p></div>
        <button type="button" className="secondary-button" disabled={blocked || refreshing} onClick={() => setReload(value => value + 1)}>
          <RefreshCw size={15} />{t('Refresh members', language)}</button></div>
      {loadError !== null && <div className="alert error" role="alert"><CircleAlert size={17} /><span>{errorMessage(loadError, language)}</span></div>}
      {notice && <div className="alert neutral" role="status"><ArrowRightLeft size={17} /><span>{t(notice, language)}</span></div>}
      {refreshing && !data && <p className="admin-loading" role="status"><LoaderCircle className="spin" size={16} />{t('Loading members…', language)}</p>}
      {data && <>
        <div className="admin-members-table-wrap"><table className="admin-members-table" aria-label={t('Joined members', language)}>
          <thead><tr><th scope="col">{t('Member', language)}</th><th scope="col">{t('Role', language)}</th><th scope="col">{t('Ownership', language)}</th></tr></thead>
          <tbody>{data.members.map(member => <tr key={member.userId}>
            <td><strong>{member.displayName || member.email}</strong><span>{member.email}</span></td>
            <td>{t(member.role === 'OWNER' ? 'Owner' : member.role === 'ADMIN' ? 'Admin' : 'Member', language)}</td>
            <td>{member.role === 'OWNER' ? <span className="admin-owner-label">{t('Current owner', language)}</span>
              : <button type="button" className="secondary-button" disabled={!canTransfer || blocked || refreshing}
                aria-label={`${t('Transfer ownership to', language)} ${member.email}`}
                onClick={() => { setActionError(null); setTarget(member); }}>
                <ArrowRightLeft size={14} />{t('Make owner', language)}</button>}</td>
          </tr>)}</tbody>
        </table></div>
        {owners.length !== 1 && <p className="admin-explanation">{t('Ownership transfer requires exactly one current owner.', language)}</p>}
        {eligible.length === 0 && <p className="admin-explanation">{t('No joined member is available for ownership transfer yet. Pending invitations cannot become owners.', language)}</p>}
        <p className="admin-handoff-note">{t('The previous owner remains an ADMIN after transfer and continues to count toward the user limit.', language)}</p>
      </>}
    </section>
    {data && organization.status === 'ACTIVE' && <div className="admin-invitations">
      {data.subscription.effective.seatLimit < 2 && <p className="admin-explanation">{t('Allow at least two users before inviting your customer: you currently occupy the owner seat.', language)}</p>}
      <OrganizationInvitations api={api} organizationId={organization.id} organizationRole="OWNER"
        seatLimit={data.subscription.effective.seatLimit} membershipRevision={membershipRevision + revision}
        language={language} onUnauthorized={onUnauthorized} onBuySeats={onManageAccess}
        capacityActionLabel="Manage subscription access" disabled={blocked || loadError !== null || refreshing}
        onBusyChange={onBusy} />
    </div>}
    {organization.status !== 'ACTIVE' && <p className="admin-explanation">{t('Restore organization access before sending invitations.', language)}</p>}
    {target && <dialog ref={dialog} className="station-delete-dialog admin-transfer-dialog" aria-labelledby="admin-transfer-title"
      aria-describedby="admin-transfer-description" onCancel={event => { event.preventDefault(); cancel(); }}>
      <h2 id="admin-transfer-title">{t('Transfer organization ownership?', language)}</h2>
      <p><strong>{organization.name}</strong></p>
      <p>{t('New owner', language)}: <strong>{target.email}</strong></p>
      <p id="admin-transfer-description">{t('The selected member becomes OWNER and the current owner becomes ADMIN. Platform SUPERADMIN access is unchanged.', language)}</p>
      {actionError !== null && <div className="alert error" role="alert">{errorMessage(actionError, language)}</div>}
      <div className="admin-dialog-actions"><button type="button" className="secondary-button" autoFocus disabled={saving} onClick={cancel}>{t('Cancel', language)}</button>
        <button type="button" className="primary-button" disabled={saving || blocked || refreshing || !canTransfer} onClick={() => { void transfer(); }}>
          {saving ? <LoaderCircle className="spin" size={16} /> : <ArrowRightLeft size={16} />}{t('Transfer ownership', language)}</button></div>
    </dialog>}
  </div>;
}
