import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { BenchmarkApi } from '@benchmark/api';
import type { OrganizationSummary, UserLanguage } from '@benchmark/domain';
import { t } from '../language';
import { BillingSettings } from './BillingSettings';

export function SeatPurchaseDialog({ api, organization, language, onChanged, onUnauthorized, onClose }: {
  api: BenchmarkApi;
  organization: OrganizationSummary;
  language: UserLanguage;
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busy) onClose(); };
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return <dialog ref={dialogRef} className="seat-purchase-dialog" aria-labelledby="seat-purchase-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="seat-purchase-heading">
      <h2 id="seat-purchase-title">{t('Buy more seats', language)}</h2>
      <button type="button" className="secondary-button" aria-label={t('Close', language)} disabled={busy} onClick={close}>
        <X size={18} aria-hidden="true" />{t('Close', language)}
      </button>
    </div>
    <BillingSettings api={api} organization={organization} language={language} seatsOnly
      onChanged={onChanged} onUnauthorized={onUnauthorized} onExit={close} onBusyChange={setBusy} />
  </dialog>;
}
