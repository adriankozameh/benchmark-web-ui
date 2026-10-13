import type { BillingInterval, BillingSelection, BillingSummary } from '@benchmark/domain';

/** Add paid seats to one cadence while preserving the plan, stations and existing add-ons. */
export function addSeats(selection: BillingSelection, interval: BillingInterval, quantity: number): BillingSelection {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError('Seat quantity must be a positive integer.');
  const key = interval === 'MONTHLY' ? 'monthlySeatAddons' : 'annualSeatAddons';
  const total = selection[key] + quantity;
  if (total > 10000) throw new RangeError('Seat quantity exceeds the purchase limit.');
  return { ...selection, [key]: total };
}

export type PendingPurchase = { selection: BillingSelection; mode: 'INITIAL' | 'IMMEDIATE' | 'ANNUAL_PREPAYMENT' };

export function parsePendingPurchase(raw: string | null): PendingPurchase | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const { mode, selection } = value as Record<string, unknown>;
    if (mode !== 'INITIAL' && mode !== 'IMMEDIATE' && mode !== 'ANNUAL_PREPAYMENT') return null;
    if (!selection || typeof selection !== 'object') return null;
    const { plan, interval, stationsPurchased, monthlySeatAddons, annualSeatAddons } = selection as Record<string, unknown>;
    const count = (n: unknown, min: number): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= 10000;
    if ((plan !== 'PRO' && plan !== 'PREMIUM') || (interval !== 'MONTHLY' && interval !== 'ANNUAL')
      || !count(stationsPurchased, 1) || !count(monthlySeatAddons, 0) || !count(annualSeatAddons, 0)) return null;
    if (mode === 'ANNUAL_PREPAYMENT' && interval !== 'ANNUAL') return null;
    return { mode, selection: { plan, interval, stationsPurchased, monthlySeatAddons, annualSeatAddons } };
  } catch { return null; }
}

export const hasPendingBillingPayment = (summary: BillingSummary): boolean =>
  summary.pendingPayment || summary.pendingAnnualTransition?.status === 'AWAITING_PAYMENT';

export function billingPaymentConfirmed(summary: BillingSummary, pending: PendingPurchase | null): boolean {
  if (hasPendingBillingPayment(summary) || !summary.selection || !['ACTIVE', 'TRIALING'].includes(summary.status)) return false;
  if (!pending) return true;
  if (pending.mode === 'ANNUAL_PREPAYMENT') {
    return summary.pendingAnnualTransition?.status === 'SCHEDULED' || sameSelection(pending.selection, summary.selection);
  }
  if (pending.mode === 'INITIAL') {
    const current = summary.selection;
    const expected = pending.selection;
    return current.plan === expected.plan && current.interval === expected.interval
      && current.stationsPurchased >= expected.stationsPurchased
      && current.monthlySeatAddons >= expected.monthlySeatAddons && current.annualSeatAddons >= expected.annualSeatAddons;
  }
  return sameSelection(pending.selection, summary.selection);
}

export const includedSeats = (plan: BillingSelection['plan'], stations: number): number => plan === 'PREMIUM' ? stations * 10 : 1;

export function sameSelection(first: BillingSelection | null | undefined, second: BillingSelection | null | undefined): boolean {
  return Boolean(first && second && first.plan === second.plan && first.interval === second.interval
    && first.stationsPurchased === second.stationsPurchased && first.monthlySeatAddons === second.monthlySeatAddons
    && first.annualSeatAddons === second.annualSeatAddons);
}

/** Preserve total capacity while removing paid users now included with PREMIUM stations. */
export function reallocateIncludedSeats(selection: BillingSelection, plan: BillingSelection['plan'], stations: number): BillingSelection {
  const currentTotal = includedSeats(selection.plan, selection.stationsPurchased) + selection.monthlySeatAddons + selection.annualSeatAddons;
  const paidNeeded = Math.max(0, currentTotal - includedSeats(plan, stations));
  const annual = Math.min(selection.annualSeatAddons, paidNeeded);
  return { ...selection, plan, stationsPurchased: stations, annualSeatAddons: annual, monthlySeatAddons: paidNeeded - annual };
}

export function safeBillingUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('The payment link is invalid. Refresh Billing and try again.');
  return parsed.href;
}
