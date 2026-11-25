import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import type { UserLanguage } from '@benchmark/domain';
import { t } from '../language';

export function ChartInfo({ title, language, children }: {
  title: string; language: UserLanguage; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const label = t('Chart information: {metric}', language).replace('{metric}', title);

  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const opener = trigger.current;
    element.showModal();
    closeButton.current?.focus();
    return () => {
      element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  function dismissBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom) setOpen(false);
  }

  return <>
    <button ref={trigger} type="button" className="forecast-chart-info" aria-label={label}
      title={t('Chart information', language)} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}><Info size={18} aria-hidden="true" /></button>
    {open && createPortal(<dialog ref={dialog} className="chart-info-dialog" aria-labelledby={headingId} aria-modal="true"
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={dismissBackdrop}>
      <div className="chart-info-heading"><h2 id={headingId}>{label}</h2>
        <button ref={closeButton} type="button" className="forecast-chart-info"
          aria-label={t('Close chart information', language)} onClick={() => setOpen(false)}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="chart-info-content">{children}</div>
    </dialog>, document.body)}
  </>;
}
