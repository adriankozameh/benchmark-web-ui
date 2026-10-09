import type { BillingSelection } from '@benchmark/domain';

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
