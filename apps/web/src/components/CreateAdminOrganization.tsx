import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Building2, CircleAlert, LoaderCircle } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { AdminOrganization, CreateAdminOrganizationInput, UserLanguage } from '@benchmark/domain';
import { errorMessage, t } from '../language';

type Props = {
  api: BenchmarkApi;
  language: UserLanguage;
  onCreated: (organization: AdminOrganization) => void;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onUnauthorized: () => void;
  onForbidden: () => void;
};

export function CreateAdminOrganization({ api, language, onCreated, onClose, onBusy, onUnauthorized, onForbidden }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CreateAdminOrganizationInput['type']>('TEAM');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => { mounted.current = false; element?.close(); };
  }, []);

  function close() {
    if (!inFlight.current) onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!name.trim() || name.trim().length > 200) {
      setValidation('Enter an organization name of 1 to 200 characters.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setValidation(null);
    onBusy(true);
    try {
      const created = await api.createAdminOrganization({ name: name.trim(), type });
      if (mounted.current) onCreated(created);
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

  return <dialog ref={dialog} className="station-delete-dialog admin-create-dialog" aria-labelledby="admin-create-title"
    aria-describedby="admin-create-description" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={event => { void submit(event); }}>
      <h2 id="admin-create-title">{t('Create organization', language)}</h2>
      <p id="admin-create-description">{t('You will be the initial owner. Invite someone by email, then transfer ownership after they join.', language)}</p>
      <fieldset disabled={saving}>
        <label className="field"><span>{t('Organization name', language)}</span>
          <input autoFocus required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="field"><span>{t('Organization type', language)}</span>
          <select aria-label={t('Organization type', language)} value={type} onChange={event => setType(event.target.value as CreateAdminOrganizationInput['type'])}>
            <option value="TEAM">{t('Team', language)}</option>
            <option value="PERSONAL">{t('Personal', language)}</option>
          </select></label>
        <p>{t('New organizations start with a FREE trial. Use the subscription grant to set their plan and capacity.', language)}</p>
        {validation && <div className="alert error" role="alert">{t(validation, language)}</div>}
        {error !== null && <div className="alert error" role="alert"><CircleAlert size={17} /><span>{errorMessage(error, language)}</span></div>}
        <div className="admin-dialog-actions"><button type="button" className="secondary-button" onClick={close}>{t('Cancel', language)}</button>
          <button type="submit" className="primary-button">{saving ? <LoaderCircle className="spin" size={16} /> : <Building2 size={16} />}
            {t('Create organization', language)}</button></div>
      </fieldset>
    </form>
  </dialog>;
}
