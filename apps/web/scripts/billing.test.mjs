import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { billingPaymentConfirmed, hasPendingBillingPayment, includedSeats, parsePendingPurchase, reallocateIncludedSeats, safeBillingUrl, sameSelection } from '../src/components/billingSelection.ts';
import { pollBilling } from '../src/components/billingPolling.ts';

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

const selection = { plan: 'PREMIUM', interval: 'ANNUAL', stationsPurchased: 1, monthlySeatAddons: 4, annualSeatAddons: 0 };
const summary = { status: 'ACTIVE', selection, pendingPayment: false, pendingAnnualTransition: null };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('an initial checkout is settled when the active plan already includes extra users', () => {
  const initial = { mode: 'INITIAL', selection: { ...selection, monthlySeatAddons: 0 } };
  assert.equal(billingPaymentConfirmed(summary, initial), true);
  assert.equal(billingPaymentConfirmed({ ...summary, selection: { ...selection, plan: 'PRO' } }, initial), false);
  assert.equal(billingPaymentConfirmed({ ...summary, selection: { ...selection, interval: 'MONTHLY' } }, initial), false);
});

test('capacity purchases wait for their actual selection to become active', () => {
  const pending = { mode: 'IMMEDIATE', selection: { ...selection, monthlySeatAddons: 5 } };
  assert.equal(billingPaymentConfirmed(summary, pending), false);
  assert.equal(billingPaymentConfirmed({ ...summary, selection: pending.selection }, pending), true);
});

test('an active plan does not confirm unpaid invoices or annual payments', () => {
  for (const pending of [null, { mode: 'INITIAL', selection }, { mode: 'IMMEDIATE', selection }, { mode: 'ANNUAL_PREPAYMENT', selection }]) {
    assert.equal(billingPaymentConfirmed({ ...summary, pendingPayment: true }, pending), false);
    assert.equal(billingPaymentConfirmed({ ...summary, pendingAnnualTransition: { status: 'AWAITING_PAYMENT' } }, pending), false);
  }
  assert.equal(hasPendingBillingPayment(summary), false);
  assert.equal(hasPendingBillingPayment({ ...summary, pendingPayment: true }), true);
  assert.equal(hasPendingBillingPayment({ ...summary, pendingAnnualTransition: { status: 'AWAITING_PAYMENT' } }), true);
});

test('scheduled annual prepayment confirms while the paid monthly period is still current', () => {
  const pending = { mode: 'ANNUAL_PREPAYMENT', selection };
  const scheduled = { ...summary, selection: { ...selection, interval: 'MONTHLY' }, pendingAnnualTransition: { status: 'SCHEDULED' } };
  assert.equal(billingPaymentConfirmed(scheduled, pending), true);
  assert.equal(billingPaymentConfirmed({ ...scheduled, pendingPayment: true }, pending), false);
  assert.equal(billingPaymentConfirmed({ ...scheduled, pendingAnnualTransition: null }, pending), false);
});

test('an expired, canceled, or missing subscription is never reported as paid', () => {
  for (const status of ['FREE', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAST_DUE']) {
    assert.equal(billingPaymentConfirmed({ ...summary, status }, null), false);
  }
  assert.equal(billingPaymentConfirmed({ ...summary, selection: null }, null), false);
  assert.equal(billingPaymentConfirmed({ ...summary, status: 'TRIALING' }, null), true);
});

test('malformed saved purchases are discarded instead of keeping confirmation pending', () => {
  const pending = { mode: 'IMMEDIATE', selection };
  assert.deepEqual(parsePendingPurchase(JSON.stringify(pending)), pending);
  for (const raw of [null, '', 'broken', 'null', '7', '{}', JSON.stringify({ mode: 'UNKNOWN', selection }),
    JSON.stringify({ mode: 'INITIAL' }), JSON.stringify({ ...pending, selection: { ...selection, monthlySeatAddons: -1 } }),
    JSON.stringify({ ...pending, selection: { ...selection, stationsPurchased: 1.5 } }),
    JSON.stringify({ mode: 'ANNUAL_PREPAYMENT', selection: { ...selection, interval: 'MONTHLY' } })]) {
    assert.equal(parsePendingPurchase(raw), null);
  }
});

test('confirmation times out and aborts a hung request after two minutes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve, signal, updates = 0, errors = 0, timeouts = 0;
  const cancel = pollBilling(nextSignal => {
    signal = nextSignal;
    return new Promise(done => { resolve = done; });
  }, () => { updates++; return false; }, () => { errors++; }, () => { timeouts++; });
  t.after(cancel);
  t.mock.timers.tick(119_999);
  assert.equal(timeouts, 0);
  t.mock.timers.tick(1);
  assert.equal(timeouts, 1);
  assert.equal(signal.aborted, true);
  resolve(summary);
  await flush();
  t.mock.timers.tick(120_000);
  assert.equal(updates, 0);
  assert.equal(errors, 0);
  assert.equal(timeouts, 1);
});

test('confirmation retries network failures and stops when the server confirms', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, updates = 0, errors = 0, timeouts = 0;
  const cancel = pollBilling(async () => {
    calls++;
    if (calls === 1) throw new Error('Temporary network failure');
    return { ...summary, pendingPayment: calls === 2 };
  }, next => { updates++; return billingPaymentConfirmed(next, null); }, () => { errors++; }, () => { timeouts++; });
  t.after(cancel);
  await flush();
  t.mock.timers.tick(4000);
  await flush();
  t.mock.timers.tick(4000);
  await flush();
  assert.equal(calls, 3);
  assert.equal(updates, 2);
  assert.equal(errors, 1);
  t.mock.timers.tick(120_000);
  await flush();
  assert.equal(calls, 3);
  assert.equal(timeouts, 0);
});

test('pending responses keep one deadline instead of extending the confirmation loop', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, timeouts = 0;
  const cancel = pollBilling(async () => { calls++; return { ...summary, pendingPayment: true }; }, () => false,
    assert.fail, () => { timeouts++; });
  t.after(cancel);
  await flush();
  for (let i = 0; i < 30; i++) { t.mock.timers.tick(4000); await flush(); }
  assert.equal(timeouts, 1);
  const stoppedAt = calls;
  t.mock.timers.tick(120_000);
  await flush();
  assert.equal(calls, stoppedAt);
});

test('leaving Billing cancels requests and ignores late responses', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve, signal;
  const cancel = pollBilling(nextSignal => {
    signal = nextSignal;
    return new Promise(done => { resolve = done; });
  }, assert.fail, assert.fail, assert.fail);
  cancel();
  assert.equal(signal.aborted, true);
  resolve(summary);
  await flush();
  t.mock.timers.tick(120_000);
  await flush();
});

test('billing status requests forward the polling cancellation signal', async t => {
  const source = fs.readFileSync(new URL('../../../packages/api/src/index.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  const { BenchmarkApi } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://example.invalid/api/v1/organizations/org/billing');
    assert.equal(options.signal, controller.signal);
    return new Response(JSON.stringify(summary));
  });
  const api = new BenchmarkApi('https://example.invalid', async () => 'token');
  assert.deepEqual(await api.getBilling('org', controller.signal), summary);
});
