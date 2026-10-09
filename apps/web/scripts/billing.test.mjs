import { test } from 'node:test';
import assert from 'node:assert/strict';
import { includedSeats, reallocateIncludedSeats, safeBillingUrl, sameSelection } from '../src/components/billingSelection.ts';

test('PREMIUM stations include ten users each; PRO stations include one user total', () => {
  assert.equal(includedSeats('PREMIUM', 3), 30);
  assert.equal(includedSeats('PRO', 3), 1);
});
test('PRO to PREMIUM removes paid users now included without losing capacity', () => {
  const result = reallocateIncludedSeats({ plan: 'PRO', interval: 'MONTHLY', stationsPurchased: 2, monthlySeatAddons: 9, annualSeatAddons: 5 }, 'PREMIUM', 2);
  assert.equal(result.monthlySeatAddons, 0);
  assert.equal(result.annualSeatAddons, 0);
  assert.equal(includedSeats(result.plan, result.stationsPurchased), 20);
});
test('capacity upgrades keep independently billed annual seats when still needed', () => {
  const result = reallocateIncludedSeats({ plan: 'PRO', interval: 'ANNUAL', stationsPurchased: 1, monthlySeatAddons: 15, annualSeatAddons: 15 }, 'PREMIUM', 2);
  assert.equal(result.annualSeatAddons, 11);
  assert.equal(result.monthlySeatAddons, 0);
  assert.equal(includedSeats(result.plan, result.stationsPurchased) + result.annualSeatAddons, 31);
});
test('payment redirects require secure URLs without credentials', () => {
  assert.throws(() => safeBillingUrl('javascript:alert(1)'));
  assert.throws(() => safeBillingUrl('https://attacker@stripe.com'));
  assert.throws(() => safeBillingUrl('http://example.com/pay'));
  assert.equal(safeBillingUrl('https://checkout.stripe.com/pay/fixture'), 'https://checkout.stripe.com/pay/fixture');
});
test('server confirmation compares selection values independently of JSON property order', () => {
  const first = { plan: 'PRO', interval: 'MONTHLY', stationsPurchased: 1, monthlySeatAddons: 0, annualSeatAddons: 0 };
  const reordered = { annualSeatAddons: 0, monthlySeatAddons: 0, stationsPurchased: 1, interval: 'MONTHLY', plan: 'PRO' };
  assert.equal(sameSelection(first, reordered), true);
  assert.equal(sameSelection(first, { ...first, stationsPurchased: 2 }), false);
  assert.equal(sameSelection(first, null), false);
});
