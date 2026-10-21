import type { AdminSubscription, SubscriptionGrantInput } from '@benchmark/domain';

export type GrantDraft = {
  plan: SubscriptionGrantInput['plan'];
  seats: string;
  stations: string;
  reason: string;
};

export function minimumGrantLimits(subscription: AdminSubscription) {
  return {
    seats: Math.max(1, subscription.billing.seatsPurchased, subscription.usage.seatsUsed),
    stations: Math.max(1, subscription.billing.stationsPurchased, subscription.usage.stationsUsed),
  };
}

export function grantDraft(subscription: AdminSubscription): GrantDraft {
  const minimum = minimumGrantLimits(subscription);
  return {
    plan: subscription.effective.plan === 'PREMIUM' ? 'PREMIUM' : 'PRO',
    seats: String(Math.max(minimum.seats, subscription.override?.seatLimit ?? subscription.effective.seatLimit)),
    stations: String(Math.max(minimum.stations, subscription.override?.stationLimit ?? subscription.effective.stationLimit)),
    reason: subscription.override?.reason ?? '',
  };
}

export function validateGrant(draft: GrantDraft, subscription: AdminSubscription): string | null {
  if (draft.plan !== 'PRO' && draft.plan !== 'PREMIUM') return 'Choose PRO or PREMIUM.';
  if (subscription.billing.plan === 'PREMIUM' && draft.plan !== 'PREMIUM') {
    return 'A grant cannot lower the billing plan.';
  }
  const seats = Number(draft.seats);
  const stations = Number(draft.stations);
  if (!draft.seats.trim() || !draft.stations.trim() || !Number.isInteger(seats) || !Number.isInteger(stations)
      || seats < 1 || stations < 1 || seats > 2147483647 || stations > 2147483647) {
    return 'Enter whole numbers of at least 1 for users and stations.';
  }
  const minimum = minimumGrantLimits(subscription);
  if (seats < minimum.seats || stations < minimum.stations) {
    return 'Limits must cover current usage and purchased capacity.';
  }
  if (!draft.reason.trim()) return 'Enter a reason for this grant.';
  if (draft.reason.trim().length > 500) return 'The reason must be 500 characters or fewer.';
  return null;
}

export function grantInput(draft: GrantDraft): SubscriptionGrantInput {
  return { plan: draft.plan, seatLimit: Number(draft.seats), stationLimit: Number(draft.stations), reason: draft.reason.trim() };
}

export function billingAccess(subscription: AdminSubscription) {
  const usable = subscription.billing.status === 'ACTIVE' || subscription.billing.status === 'TRIALING';
  return {
    plan: usable ? subscription.billing.plan : 'FREE',
    seats: usable ? subscription.billing.seatsPurchased : 1,
    stations: usable && subscription.billing.plan !== 'FREE' ? subscription.billing.stationsPurchased : 1,
  };
}
