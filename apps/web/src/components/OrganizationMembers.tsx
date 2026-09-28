import { useEffect, useRef, useState } from 'react';
import { CircleAlert, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { OrganizationMember, UserLanguage } from '@benchmark/domain';
import { errorMessage, t } from '../language';

type Props = {
  api: BenchmarkApi;
  organizationId: string;
  organizationRole: string;
  currentUserId: string;
  language: UserLanguage;
  onUnauthorized: () => void;
  onMembershipChanged: () => void;
};

export function OrganizationMembers({ api, organizationId, organizationRole, currentUserId, language, onUnauthorized, onMembershipChanged }: Props) {
  const canManage = organizationRole === 'OWNER' || organizationRole === 'ADMIN';
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<OrganizationMember | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [removalError, setRemovalError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    setLoading(true);
    setError(null);
    void api.listMembers(organizationId).then(rows => {
      if (active) setMembers(rows);
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(errorMessage(cause, language));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, organizationId, canManage, language, onUnauthorized, reload]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (removing) dialog?.showModal();
    return () => dialog?.close();
  }, [removing]);

  function editable(member: OrganizationMember) {
    return canManage && member.role !== 'OWNER' && member.userId !== currentUserId;
  }

  function cancelRemoval() {
    if (inFlight.current) return;
    setRemoving(null);
    setConfirmation('');
    setRemovalError(null);
  }

  async function changeRole(member: OrganizationMember) {
    if (!editable(member) || inFlight.current || loading || removing) return;
    inFlight.current = true;
    setBusy(member.userId);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateMemberRole(organizationId, member.userId,
        member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN');
      setMembers(current => current.map(row => row.userId === updated.userId ? updated : row));
      setNotice(t('Member role updated.', language));
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(errorMessage(cause, language));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function removeMember() {
    if (!removing || !editable(removing) || confirmation !== 'delete' || inFlight.current) return;
    inFlight.current = true;
    setBusy(removing.userId);
    setRemovalError(null);
    setNotice(null);
    try {
      await api.removeMember(organizationId, removing.userId);
      setMembers(current => current.filter(row => row.userId !== removing.userId));
      setRemoving(null);
      setConfirmation('');
      setNotice(t('Member removed from the organization.', language));
      onMembershipChanged();
    } catch (cause) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setRemovalError(errorMessage(cause, language));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  if (!canManage) return null;

  return <section className="station-form-card organization-members">
    <div className="invitation-list-heading">
      <h2>{t('Organization members', language)}</h2>
      <button type="button" className="secondary-button" disabled={loading || busy !== null || removing !== null}
        onClick={() => setReload(value => value + 1)}><RefreshCw size={15} />{t('Refresh', language)}</button>
    </div>
    {error && <div className="alert error compact" role="alert"><CircleAlert size={17} />{error}</div>}
    {notice && <p role="status" className="invitation-notice">{notice}</p>}
    {loading ? <p role="status"><LoaderCircle className="spin" size={16} /> {t('Loading members…', language)}</p>
      : members.length === 0 ? !error && <p>{t('No organization members found.', language)}</p>
        : <div className="organization-members-scroll" tabIndex={0} role="region" aria-label={t('Organization members', language)}>
          <table className="organization-members-table">
            <thead><tr><th scope="col">{t('Name', language)}</th><th scope="col">{t('Email address', language)}</th>
              <th scope="col">{t('Role', language)}</th><th scope="col">{t('Actions', language)}</th></tr></thead>
            <tbody>{members.map(member => <tr key={member.userId}>
              <td>{member.displayName || member.username || member.email}</td>
              <td>{member.email}</td>
              <td>{t(member.role === 'OWNER' ? 'Owner' : member.role === 'ADMIN' ? 'Admin' : 'Member', language)}</td>
              <td>{editable(member) && <div className="organization-member-actions">
                <button type="button" className="secondary-button" disabled={busy !== null || removing !== null}
                  onClick={() => { void changeRole(member); }}>
                  {busy === member.userId && <LoaderCircle className="spin" size={15} />}
                  {t(member.role === 'ADMIN' ? 'Demote to Member' : 'Promote to Admin', language)}</button>
                <button type="button" className="text-button provider-delete-button" disabled={busy !== null || removing !== null}
                  onClick={() => { setConfirmation(''); setRemovalError(null); setError(null); setRemoving(member); }}>
                  <Trash2 size={15} />{t('Remove member', language)}</button>
              </div>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    <dialog ref={dialogRef} className="station-delete-dialog" aria-labelledby="member-remove-title"
      aria-describedby="member-remove-warning" onCancel={event => { event.preventDefault(); cancelRemoval(); }}>
      <form onSubmit={event => { event.preventDefault(); void removeMember(); }}>
        <h2 id="member-remove-title">{t('Remove member', language)}: {removing?.email}</h2>
        <p id="member-remove-warning">{t('This removes the member’s access to this organization. Their account and memberships in other organizations will be kept.', language)}</p>
        <label className="field"><span>{t('Type delete to confirm', language)}</span>
          <input autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} value={confirmation}
            disabled={busy !== null} onChange={event => setConfirmation(event.target.value)} />
        </label>
        {removalError && <div className="alert error compact" role="alert">{removalError}</div>}
        <div className="station-details-actions">
          <button type="button" className="secondary-button" disabled={busy !== null} onClick={cancelRemoval}>{t('Cancel', language)}</button>
          <button type="submit" className="primary-button station-delete-confirm" disabled={busy !== null || confirmation !== 'delete'}>
            {busy !== null && <LoaderCircle className="spin" size={17} />}{t('Remove member', language)}</button>
        </div>
      </form>
    </dialog>
  </section>;
}
