import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, CreditCard, LoaderCircle, ShieldCheck } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { BillingInterval, BillingPrice, BillingQuote, BillingSelection, BillingSummary, OrganizationSummary, UserLanguage } from '@benchmark/domain';
import { errorMessage, locale, t } from '../language';
import { includedSeats, reallocateIncludedSeats, safeBillingUrl, sameSelection } from './billingSelection';
import './billing.css';

type PendingPurchase = { selection: BillingSelection; mode: 'INITIAL' | 'IMMEDIATE' | 'ANNUAL_PREPAYMENT' };
const pendingKey = (org: string) => `benchmark.billing.pending.${org}`;
/**
 * Stripe's hosted invoice page has no way back to the app, so it opens beside Billing, which keeps
 * polling. Returns false when the browser blocked the tab.
 */
function openPaymentTab(url: string): boolean {
  const tab = window.open(safeBillingUrl(url), '_blank');
  if (!tab) return false;
  tab.opener = null;
  return true;
}
const money = (amount: number, currency: string, language: UserLanguage) =>
  new Intl.NumberFormat(locale(language), { style: 'currency', currency }).format(amount / 100);
const date = (value: string | null, language: UserLanguage) => value ?
  new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) : '—';

export function BillingSettings({ api, organization, language, onChanged, onUnauthorized }: {
  api: BenchmarkApi; organization: OrganizationSummary; language: UserLanguage;
  onChanged: () => Promise<void>; onUnauthorized: () => void;
}) {
  const manager = ['OWNER', 'ADMIN'].includes(organization.role);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [draft, setDraft] = useState<BillingSelection | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('MONTHLY');
  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const requestKeys = useRef(new Map<string, string>());
  const reviewRef = useRef<HTMLElement>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  useEffect(() => {
    if (quote) { reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); reviewRef.current?.focus({ preventScroll: true }); }
  }, [quote]);
  const key = (operation: string) => {
    const existing = requestKeys.current.get(operation);
    if (existing) return existing;
    const created = crypto.randomUUID(); requestKeys.current.set(operation, created); return created;
  };
  const failure = useCallback((cause: unknown) => {
    if (cause instanceof BenchmarkApiError && cause.status === 401) { onUnauthorized(); return; }
    setError(errorMessage(cause, languageRef.current));
  }, [onUnauthorized]);
  const reload = useCallback(async (resetDraft = true) => {
    const next = await api.getBilling(organization.id);
    setSummary(next);
    if (resetDraft) setDraft(next.selection);
    return next;
  }, [api, organization.id]);

  useEffect(() => {
    if (!manager) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    api.getBilling(organization.id).then(next => {
      if (!live) return;
      setSummary(next); setDraft(next.selection); setLoading(false);
      const result = new URLSearchParams(window.location.search).get('billing');
      if (result === 'cancelled') {
        setNotice('Checkout cancelled. You can review your purchase again.');
        sessionStorage.removeItem(pendingKey(organization.id));
      } else if (result === 'success' || sessionStorage.getItem(pendingKey(organization.id))) {
        setNotice('Confirming your payment…'); setPolling(true);
      } else if (next.pendingPayment || next.pendingAnnualTransition?.status === 'AWAITING_PAYMENT') setPolling(true);
    }).catch(cause => { if (live) { failure(cause); setLoading(false); } });
    return () => { live = false; };
  }, [api, organization.id, manager, failure]);

  useEffect(() => {
    if (!polling) return;
    let live = true;
    let timer: number | undefined;
    const until = Date.now() + 120_000;
    const poll = async () => {
      try {
        const next = await reload(false);
        if (!live) return;
        let pending: PendingPurchase | null = null;
        try { pending = JSON.parse(sessionStorage.getItem(pendingKey(organization.id)) ?? 'null') as PendingPurchase | null; } catch { /* Ignore invalid browser state. */ }
        const matches = pending && sameSelection(pending.selection, next.selection);
        const scheduled = next.pendingAnnualTransition?.status === 'SCHEDULED';
        const confirmed = pending?.mode === 'ANNUAL_PREPAYMENT' ? scheduled || (matches && !next.pendingPayment)
          : pending ? matches && !next.pendingPayment && ['ACTIVE', 'TRIALING'].includes(next.status)
          : !next.pendingPayment && next.pendingAnnualTransition?.status !== 'AWAITING_PAYMENT';
        if (confirmed) {
          setPolling(false); setDraft(next.selection);
          setNotice(scheduled ? 'Annual payment confirmed. Your annual plan starts after your current monthly period ends.' : 'Payment confirmed. Your subscription is up to date.');
          sessionStorage.removeItem(pendingKey(organization.id));
          window.history.replaceState({}, '', window.location.pathname);
          await onChanged(); return;
        }
      } catch (cause) { if (live) failure(cause); }
      if (live && Date.now() >= until) { setPolling(false); setNotice('Payment confirmation is taking longer. Refresh Billing to check its status.'); return; }
      if (live) timer = window.setTimeout(() => { void poll(); }, 4000);
    };
    void poll();
    return () => { live = false; window.clearTimeout(timer); };
  }, [polling, organization.id, reload, onChanged, failure]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      if (sessionStorage.getItem(pendingKey(organization.id)) || summary?.pendingPayment) setPolling(true);
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [organization.id, summary?.pendingPayment]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await action(); } catch (cause) { failure(cause); } finally { setBusy(false); }
  }
  function track(selection: BillingSelection, mode: PendingPurchase['mode']) {
    sessionStorage.setItem(pendingKey(organization.id), JSON.stringify({ selection, mode } satisfies PendingPurchase));
  }
  async function checkout(plan: BillingSelection['plan']) {
    await run(async () => {
      const result = await api.startSubscription(organization.id, plan, billingInterval, key(`checkout-${plan}-${billingInterval}`));
      track({ plan, interval: billingInterval, stationsPurchased: 1, monthlySeatAddons: 0, annualSeatAddons: 0 }, 'INITIAL');
      window.location.assign(safeBillingUrl(result.url));
    });
  }
  async function portal() {
    await run(async () => { const result = await api.openBillingPortal(organization.id); window.location.assign(safeBillingUrl(result.url)); });
  }
  async function review(selection: BillingSelection) {
    await run(async () => { setAccepted(false); setQuote(await api.quoteBillingChange(organization.id, selection)); });
  }
  async function confirm() {
    if (!quote) return;
    await run(async () => {
      const result = await api.applyBillingQuote(organization.id, quote.id, accepted, key(`quote-${quote.id}`));
      if (result.status === 'AWAITING_PAYMENT') {
        track(quote.selection, quote.mode); setQuote(null);
        const opened = result.actionUrl ? openPaymentTab(result.actionUrl) : false;
        setNotice(opened
          ? 'Complete the payment in the new tab. This page updates automatically.'
          : 'Your purchase needs payment confirmation. Select Resolve payment to complete it.');
        await reload(false); setPolling(true);
      } else {
        setQuote(null); setNotice('Your subscription has been updated.');
        await reload(); await onChanged();
      }
    });
  }
  const amount = (kind: BillingPrice['kind'], plan: BillingSelection['plan'] | null, cadence: BillingInterval) =>
    summary?.prices.find(p => p.kind === kind && p.interval === cadence && (kind === 'SEAT' || p.plan === plan))?.unitAmount ?? 0;
  const currency = summary?.prices[0]?.currency ?? 'usd';
  const priceLabel = (kind: BillingPrice['kind'], plan: BillingSelection['plan'] | null, cadence: BillingInterval) => money(amount(kind, plan, cadence), currency, language);
  const priceName = (price: BillingPrice) => `${price.kind === 'PLAN' ? price.plan : t(price.kind === 'STATION' ? 'Additional station' : 'Additional user', language)} · ${t(price.interval === 'MONTHLY' ? 'Monthly' : 'Annual', language)}`;
  const active = summary?.selection && !['CANCELED', 'INCOMPLETE_EXPIRED'].includes(summary.status);
  const blocked = busy || Boolean(summary?.cancelAtPeriodEnd || summary?.pendingPayment || summary?.pendingAnnualTransition);
  const changed = draft && summary?.selection && !sameSelection(draft, summary.selection);

  if (!manager) return <section className="billing-panel"><h2>{t('Billing', language)}</h2><p>{t('Only the account owner and administrators can manage billing.', language)}</p></section>;
  if (loading) return <div className="billing-loading"><LoaderCircle className="spin" size={22} />{t('Loading billing…', language)}</div>;
  return <div className="billing-settings">
    <div className="billing-heading"><div><span className="eyebrow">{t('Your subscription', language)}</span><h2>{t('Choose the right plan for your stations', language)}</h2><p>{t('Start with a plan. Add stations and users whenever you need them.', language)}</p></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => { void run(async () => { await reload(); await onChanged(); }); }}>{t('Refresh', language)}</button></div>
    {error && <div className="alert error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
    {notice && <div className="billing-notice" role="status"><CheckCircle2 size={18} /><span>{t(notice, language)}</span>{polling && <LoaderCircle size={16} className="spin" />}</div>}
    {!summary && <button type="button" className="secondary-button" onClick={() => { void run(async () => { await reload(); }); }}>{t('Try again', language)}</button>}
    {summary && <>
      {active && <section className="billing-panel billing-current"><div><span className="eyebrow">{t('Current plan', language)}</span><h3>{summary.plan} <span className="billing-status">{t(summary.status, language)}</span></h3>
        <p>{t(summary.selection!.interval === 'ANNUAL' ? 'Annual billing' : 'Monthly billing', language)} · {t('Plan next renewal', language)}: {date(summary.currentPeriodEnd, language)}</p></div>
        <div className="billing-capacity"><strong>{summary.stationsPurchased}</strong><span>{t('Stations', language)}</span></div><div className="billing-capacity"><strong>{summary.seatsPurchased}</strong><span>{t('Users', language)}</span></div>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => { void portal(); }}><CreditCard size={16} />{t('Payments and invoices', language)}</button></section>}
      {organization.organizationStatus === 'SUSPENDED' && <div className="alert error"><CircleAlert size={18} /><span>{t('Your account is suspended. Resolve billing to restore access.', language)}</span></div>}
      {summary.pendingPayment && <section className="billing-panel"><h3>{t('Payment needs attention', language)}</h3><p>{t('Complete the payment before your new plan or capacity becomes available.', language)}</p>
        <button type="button" className="primary-button" disabled={busy} onClick={() => {
          if (!summary.paymentUrl) { void portal(); return; }
          if (!openPaymentTab(summary.paymentUrl)) { window.location.assign(safeBillingUrl(summary.paymentUrl)); return; }
          setNotice('Complete the payment in the new tab. This page updates automatically.'); setPolling(true);
        }}>{t('Resolve payment', language)}</button></section>}
      {summary.cancelAtPeriodEnd && <div className="billing-notice"><CircleAlert size={18} /><span>{t('Your subscription is scheduled to cancel. Resume it in Payments and invoices before purchasing changes.', language)}</span></div>}
      {summary.priceChanges && summary.priceChanges.length > 0 && <section className="billing-panel"><span className="eyebrow">{t('Upcoming price change', language)}</span>
        <p>{t('New prices apply from your renewal. Nothing changes before then.', language)}</p>
        <dl className="billing-line-items">{summary.priceChanges.map(change => <div key={change.id}><dt>{priceName(change.to)}{change.quantity > 1 && change.to.kind !== 'PLAN' ? ` × ${change.quantity}` : ''}<small>{t('From', language)} {date(change.effectiveAt, language)}</small></dt><dd>{money(change.from.unitAmount, change.from.currency, language)} → {money(change.to.unitAmount, change.to.currency, language)}</dd></div>)}</dl></section>}
      {summary.pendingAnnualTransition && <section className="billing-panel billing-annual"><span className="eyebrow">{t('Annual plan change', language)}</span><h3>{t(summary.pendingAnnualTransition.status === 'SCHEDULED' ? 'Annual payment confirmed' : 'Annual payment pending', language)}</h3>
        <p>{t('Annual coverage', language)}: {date(summary.pendingAnnualTransition.startsAt, language)} – {date(summary.pendingAnnualTransition.endsAt, language)}</p>
        <p>{t('Your remaining monthly days are preserved. User add-ons keep their own billing dates.', language)}</p>
        {summary.pendingAnnualTransition.status === 'AWAITING_PAYMENT' && <div className="billing-actions">
          {summary.pendingAnnualTransition.sessionUrl && <button type="button" className="primary-button" disabled={busy} onClick={() => window.location.assign(safeBillingUrl(summary.pendingAnnualTransition!.sessionUrl!))}>{t('Continue annual payment', language)}</button>}
          <button type="button" className="secondary-button" disabled={busy} onClick={() => { void run(async () => { await api.cancelUnpaidAnnualChange(organization.id); sessionStorage.removeItem(pendingKey(organization.id)); setPolling(false); await reload(); }); }}>{t('Cancel unpaid change', language)}</button></div>}</section>}
      {!active && <>
        <div className="billing-interval" aria-label={t('Billing interval', language)}>{(['MONTHLY', 'ANNUAL'] as const).map(cadence => <button type="button" key={cadence} aria-pressed={billingInterval === cadence} className={billingInterval === cadence ? 'selected' : ''} onClick={() => setBillingInterval(cadence)}>{t(cadence === 'MONTHLY' ? 'Monthly' : 'Annual', language)}</button>)}</div>
        <div className="billing-plans">{(['PRO', 'PREMIUM'] as const).map(plan => <section className={`billing-plan ${plan.toLowerCase()}`} key={plan}>
          <span className="eyebrow">{plan}</span><h3>{t(plan === 'PRO' ? 'Find your best forecast' : 'Forecasts trained for your station', language)}</h3>
          <p className="billing-price">{priceLabel('PLAN', plan, billingInterval)}<span> / {t(billingInterval === 'MONTHLY' ? 'month' : 'year', language)}</span></p>
          <ul><li>{t(plan === 'PRO' ? '1 station and 1 user included' : '1 trained station and 10 users included', language)}</li><li>{t('Add more stations and users from your dashboard', language)}</li></ul>
          <button type="button" className="primary-button wide" disabled={busy} onClick={() => { void checkout(plan); }}>{t('Subscribe', language)} · {plan}</button></section>)}</div>
        <p className="billing-secure"><ShieldCheck size={16} />{t('Secure checkout with Stripe. Receipts go to the account owner.', language)}</p>
      </>}
      {active && draft && <section className="billing-panel"><h3>{t('Upgrade or add capacity', language)}</h3>
        <div className="billing-fields"><label className="field"><span>{t('Plan', language)}</span><select value={draft.plan} disabled={blocked} onChange={event => { setQuote(null); setDraft(reallocateIncludedSeats(draft, event.target.value as BillingSelection['plan'], draft.stationsPurchased)); }}>
          {summary.plan === 'PRO' && <option value="PRO">PRO</option>}<option value="PREMIUM">PREMIUM</option></select></label>
          <label className="field"><span>{t('Total stations', language)}</span><input type="number" min={summary.stationsPurchased} max={10000} step="1" value={draft.stationsPurchased} disabled={blocked} onChange={event => { const n=Number(event.target.value); if (Number.isInteger(n) && n >= summary.stationsPurchased && n <= 10000) { setQuote(null); setDraft(reallocateIncludedSeats(draft, draft.plan, n)); } }} /></label>
          <label className="field"><span>{t('Extra users billed monthly', language)}</span><input type="number" min="0" max="10000" step="1" value={draft.monthlySeatAddons} disabled={blocked} onChange={event => { const n=Number(event.target.value); if (Number.isInteger(n) && n >= 0 && n <= 10000) { setQuote(null); setDraft({ ...draft, monthlySeatAddons: n }); } }} /><small>{priceLabel('SEAT', null, 'MONTHLY')} / {t('user per month', language)}</small></label>
          <label className="field"><span>{t('Extra users billed annually', language)}</span><input type="number" min="0" max="10000" step="1" value={draft.annualSeatAddons} disabled={blocked} onChange={event => { const n=Number(event.target.value); if (Number.isInteger(n) && n >= 0 && n <= 10000) { setQuote(null); setDraft({ ...draft, annualSeatAddons: n }); } }} /><small>{priceLabel('SEAT', null, 'ANNUAL')} / {t('user per year', language)}</small></label></div>
        <p>{t('Included users', language)}: <strong>{includedSeats(draft.plan, draft.stationsPurchased)}</strong> · {t('Total users', language)}: <strong>{includedSeats(draft.plan, draft.stationsPurchased) + draft.monthlySeatAddons + draft.annualSeatAddons}</strong></p>
        <p className="muted">{t('Additional station', language)}: {priceLabel('STATION', draft.plan, draft.interval)} / {t(draft.interval === 'MONTHLY' ? 'month' : 'year', language)}. {t('PREMIUM adds 10 included users per station. Stations follow the plan interval; extra users can use either interval.', language)}</p>
        <button type="button" className="primary-button" disabled={blocked || !changed} onClick={() => { void review(draft); }}>{t('Review cost', language)}</button>
      </section>}
      {active && summary.selection?.interval === 'MONTHLY' && <section className="billing-panel"><h3>{t('Switch to annual', language)}</h3>
        <p>{t('Pay for a year now. Your annual coverage starts when the current paid monthly period ends.', language)}</p>
        <p>{t('Annual coverage starts', language)}: <strong>{date(summary.currentPeriodEnd, language)}</strong></p>
        <button type="button" className="secondary-button" disabled={blocked} onClick={() => { void review({ ...summary.selection!, interval: 'ANNUAL' }); }}>{t('Review annual payment', language)}</button></section>}
    </>}
    {quote && <section ref={reviewRef} tabIndex={-1} className="billing-panel billing-review" aria-label={t('Review purchase', language)}><span className="eyebrow">{t('Review purchase', language)}</span><h3>{t('Amount due now', language)}: {money(quote.amountDue, quote.currency, language)}</h3>
      <p>{quote.selection.plan} · {t(quote.selection.interval === 'ANNUAL' ? 'Annual billing' : 'Monthly billing', language)} · {quote.selection.stationsPurchased} {t('Stations', language)} · {includedSeats(quote.selection.plan, quote.selection.stationsPurchased) + quote.selection.monthlySeatAddons + quote.selection.annualSeatAddons} {t('Users', language)}</p>
      <dl className="billing-line-items">{quote.lines.map((line, i) => <div key={i}><dt>{line.description}<small>{date(line.periodStart, language)} – {date(line.periodEnd, language)}</small></dt><dd>{money(line.amount, line.currency, language)}</dd></div>)}</dl>
      {quote.mode === 'ANNUAL_PREPAYMENT' ? <p>{t('This payment covers the future annual term. There is no second annual charge when it starts. User add-ons continue separately.', language)}</p> : <p>{t('This quote includes applicable prorations and credits. Capacity is updated after payment succeeds.', language)}</p>}
      {quote.renewals.length > 0 && <><h4>{t('Renewals', language)}</h4>
        <dl className="billing-line-items">{quote.renewals.map(renewal => <div key={renewal.interval}><dt>{t(renewal.interval === 'MONTHLY' ? 'Monthly' : 'Annual', language)}<small>{renewal.renewsAt ? `${t('Next renewal', language)}: ${date(renewal.renewsAt, language)}` : t('Billed from today', language)}</small></dt><dd>{money(renewal.amount, renewal.currency, language)} / {t(renewal.interval === 'MONTHLY' ? 'month' : 'year', language)}</dd></div>)}</dl></>}
      {summary?.paymentMethod && <div className="billing-payment-method"><CreditCard size={16} /><span>{summary.paymentMethod.last4 ? `${(summary.paymentMethod.brand ?? summary.paymentMethod.type).toUpperCase()} •••• ${summary.paymentMethod.last4}` : summary.paymentMethod.type}</span><button type="button" className="link-button" disabled={busy} onClick={() => { void portal(); }}>{t('Change', language)}</button></div>}
      <label className="billing-consent"><input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /><span>{t('I authorize Benchmark Labs to charge my payment method the amount due now and the renewal amounts above on each renewal until I cancel. I can cancel anytime from Billing.', language)}</span></label>
      <p className="muted">{t('Quote expires', language)}: {new Date(quote.expiresAt).toLocaleTimeString(locale(language))}</p>
      <div className="billing-actions"><button type="button" className="primary-button" disabled={busy || !accepted || Date.parse(quote.expiresAt) <= Date.now()} onClick={() => { void confirm(); }}>{busy && <LoaderCircle size={16} className="spin" />}{t(quote.mode === 'ANNUAL_PREPAYMENT' ? 'Continue to annual payment' : 'Confirm purchase', language)}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setQuote(null)}>{t('Cancel', language)}</button></div></section>}
  </div>;
}
