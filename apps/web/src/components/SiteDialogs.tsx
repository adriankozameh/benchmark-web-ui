import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleAlert, FolderPlus, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { Site, UserLanguage } from '@benchmark/domain';
import { errorMessage, t } from '../language';
import { validateSiteName } from './stationSiteRules';

type DialogProps = {
  api: BenchmarkApi;
  organizationId: string;
  language: UserLanguage;
  onUnauthorized: () => void;
  onClose: () => void;
};

export function SiteNameDialog({ api, organizationId, site, language, onUnauthorized, onClose, onSaved }: DialogProps & {
  site?: Site;
  onSaved: (site: Site) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const [name, setName] = useState(site?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => { mounted.current = false; element?.close(); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const invalid = validateSiteName(name);
    setValidation(invalid);
    if (invalid) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = site
        ? await api.renameSite(organizationId, site.id, name.trim())
        : await api.createSite(organizationId, { name: name.trim() });
      if (mounted.current) onSaved(saved);
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setError(cause);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <dialog ref={dialog} className="station-delete-dialog station-site-dialog"
    aria-labelledby="site-name-title" aria-describedby="site-name-description"
    onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose(); }}>
    <form onSubmit={event => { void submit(event); }}>
      <h2 id="site-name-title">{t(site ? 'Rename site' : 'Create site', language)}</h2>
      <p id="site-name-description">{t(site
        ? 'Stations keep their site assignment when you rename a site.'
        : 'Sites organize your stations. Creating a site does not add station capacity.', language)}</p>
      <fieldset disabled={saving}>
        <label className="field"><span>{t('Site name', language)}</span>
          <input autoFocus required maxLength={200} value={name} aria-invalid={validation ? true : undefined}
            aria-describedby={validation ? 'site-name-error' : undefined}
            onChange={event => { setName(event.target.value); setValidation(null); }} placeholder={t('e.g. North Farm', language)} />
          {validation && <small id="site-name-error" className="field-error" role="alert">{t(validation, language)}</small>}
        </label>
        {error !== null && <div className="alert error" role="alert"><CircleAlert size={17} /><span>{errorMessage(error, language)}</span></div>}
        <div className="station-details-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{t('Cancel', language)}</button>
          <button type="submit" className="primary-button">{saving ? <LoaderCircle className="spin" size={16} /> : site ? <Pencil size={16} /> : <FolderPlus size={16} />}
            {t(saving ? (site ? 'Saving site…' : 'Creating site…') : (site ? 'Save name' : 'Create site'), language)}</button>
        </div>
      </fieldset>
    </form>
  </dialog>;
}

export function DeleteSiteDialog({ api, organizationId, site, siteCount, stationCount, language,
  onUnauthorized, onClose, onDeleted, onShowStations }: DialogProps & {
  site: Site;
  siteCount: number;
  stationCount: number;
  onDeleted: (siteId: string) => void;
  onShowStations: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lastSite = siteCount <= 1;
  const occupied = stationCount > 0;

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => { mounted.current = false; element?.close(); };
  }, []);

  async function remove(event: FormEvent) {
    event.preventDefault();
    if (lastSite || occupied || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await api.deleteSite(organizationId, site.id);
      if (mounted.current) onDeleted(site.id);
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else if (cause instanceof BenchmarkApiError && cause.status === 409
          && cause.message === 'An organization must always have at least one site') {
        setError(new Error('Every organization must keep at least one site. Create another site before deleting this one.'));
      } else if (cause instanceof BenchmarkApiError && cause.status === 409
          && cause.message === "Move or delete the site's stations before deleting the site") {
        setError(new Error('This site contains stations. Move them to another site before deleting it.'));
      } else setError(cause);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <dialog ref={dialog} className="station-delete-dialog station-site-dialog"
    aria-labelledby="site-delete-title" aria-describedby="site-delete-description"
    onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose(); }}>
    <form onSubmit={event => { void remove(event); }}>
      <h2 id="site-delete-title">{t('Delete site', language)}</h2>
      <p><strong>{site.name === 'Default Site' ? t('Default Site', language) : site.name}</strong></p>
      <div id="site-delete-description">
        {lastSite && <div className="alert error" role="alert">{t('Every organization must keep at least one site. Create another site before deleting this one.', language)}</div>}
        {occupied && <div className="alert error" role="alert">{t('This site contains stations. Move them to another site before deleting it.', language)}</div>}
        {!lastSite && !occupied && <p>{t('This site is empty. Delete it permanently? This cannot be undone.', language)}</p>}
      </div>
      {error !== null && <div className="alert error" role="alert"><CircleAlert size={17} /><span>{errorMessage(error, language)}</span></div>}
      <div className="station-details-actions">
        <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>{t('Cancel', language)}</button>
        {occupied && <button type="button" className="secondary-button" disabled={saving} onClick={onShowStations}>{t('View stations', language)}</button>}
        <button type="submit" className="primary-button site-delete-confirm" disabled={saving || lastSite || occupied}>
          {saving ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}{t('Delete site', language)}</button>
      </div>
    </form>
  </dialog>;
}
