import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BenchmarkApi, BenchmarkApiError } from '../../../packages/api/src/index.ts';
import { billingAccess, grantDraft, grantInput, minimumGrantLimits, validateGrant } from '../src/components/subscriptionGrantRules.ts';

const subscription = {
  organizationId: 'organization',
  billing: { id: 'subscription', plan: 'FREE', status: 'ACTIVE', seatsPurchased: 1, stationsPurchased: 0,
    stripeBacked: false, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false },
  effective: { plan: 'FREE', seatLimit: 1, stationLimit: 1 },
  usage: { seatsUsed: 1, stationsUsed: 1 },
  override: null,
};

test('FREE organizations get a valid grant draft and retain one included station on revocation', () => {
  assert.deepEqual(grantDraft(subscription), { plan: 'PRO', seats: '1', stations: '1', reason: '' });
  assert.deepEqual(billingAccess(subscription), { plan: 'FREE', seats: 1, stations: 1 });
});

test('grant limits cover both purchased capacity and current usage', () => {
  const current = { ...subscription, billing: { ...subscription.billing, plan: 'PRO', seatsPurchased: 3, stationsPurchased: 2 },
    usage: { seatsUsed: 5, stationsUsed: 1 } };
  assert.deepEqual(minimumGrantLimits(current), { seats: 5, stations: 2 });
  assert.match(validateGrant({ plan: 'PREMIUM', seats: '4', stations: '2', reason: 'Pilot' }, current), /cover current usage/);
  assert.match(validateGrant({ plan: 'PREMIUM', seats: '5', stations: '1', reason: 'Pilot' }, current), /cover current usage/);
});

test('existing grant values and reasons are preserved for editing', () => {
  const current = { ...subscription, effective: { plan: 'PREMIUM', seatLimit: 10, stationLimit: 3 },
    override: { plan: 'PREMIUM', seatLimit: 10, stationLimit: 3, reason: 'Partner access' } };
  assert.deepEqual(grantDraft(current), { plan: 'PREMIUM', seats: '10', stations: '3', reason: 'Partner access' });
});

test('malformed quantities, blank reasons and billed plan downgrades are rejected', () => {
  const draft = { plan: 'PRO', seats: '1', stations: '1', reason: 'Pilot' };
  for (const value of ['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', '2147483648']) {
    assert.match(validateGrant({ ...draft, seats: value }, subscription), /whole numbers/);
    assert.match(validateGrant({ ...draft, stations: value }, subscription), /whole numbers/);
  }
  assert.match(validateGrant({ ...draft, reason: '   ' }, subscription), /reason/);
  assert.match(validateGrant({ ...draft, reason: 'x'.repeat(501) }, subscription), /500/);
  assert.match(validateGrant(draft, { ...subscription, billing: { ...subscription.billing, plan: 'PREMIUM' } }), /lower the billing plan/);
  assert.equal(validateGrant(draft, subscription), null);
  assert.deepEqual(grantInput({ ...draft, reason: ' Pilot ' }), { plan: 'PRO', seatLimit: 1, stationLimit: 1, reason: 'Pilot' });
});

test('revoking a grant over an inactive paid subscription restores FREE capacity', () => {
  const current = { ...subscription, billing: { ...subscription.billing, plan: 'PREMIUM', status: 'CANCELED', seatsPurchased: 20, stationsPurchased: 2 } };
  assert.deepEqual(billingAccess(current), { plan: 'FREE', seats: 1, stations: 1 });
});

test('admin requests use bearer authentication, encoded organization IDs and the existing API contracts', async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(subscription), { status: 200 });
  };
  try {
    const api = new BenchmarkApi('https://api.example.test', async () => 'access-token');
    const controller = new AbortController();
    await api.listAdminOrganizations(2, 25, controller.signal);
    await api.getAdminSubscription('org/one', controller.signal);
    await api.getAdminEntitlements('org/one', controller.signal);
    const grant = { plan: 'PREMIUM', seatLimit: 10, stationLimit: 1, reason: 'Partner' };
    assert.deepEqual(await api.saveSubscriptionGrant('org/one', grant), subscription);
    assert.deepEqual(await api.revokeSubscriptionGrant('org/one'), subscription);
    assert.equal(requests[0].url, 'https://api.example.test/api/v1/admin/organizations?page=2&size=25');
    assert.equal(requests[1].url, 'https://api.example.test/api/v1/admin/organizations/org%2Fone/subscription');
    assert.equal(requests[2].url, 'https://api.example.test/api/v1/admin/organizations/org%2Fone/entitlements');
    assert.equal(requests[3].options.method, 'PUT');
    assert.deepEqual(JSON.parse(requests[3].options.body), grant);
    assert.equal(requests[4].url, 'https://api.example.test/api/v1/admin/organizations/org%2Fone/subscription/override');
    assert.equal(requests[4].options.method, 'DELETE');
    assert.ok(requests.every(({ options }) => options.headers.get('Authorization') === 'Bearer access-token'));
    assert.equal(requests[1].options.signal, controller.signal);
  } finally { globalThis.fetch = previous; }
});

test('expired sessions send no admin request and server permission/capacity failures remain visible', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected request'); };
  try {
    const api = new BenchmarkApi('https://api.example.test', async () => null);
    await assert.rejects(api.listAdminOrganizations(), error => error instanceof BenchmarkApiError && error.status === 401);
    assert.equal(calls, 0);
    for (const status of [403, 409]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Server rejected the change' }), { status });
      const signedIn = new BenchmarkApi('https://api.example.test', async () => 'access-token');
      await assert.rejects(signedIn.revokeSubscriptionGrant('org'), error => error instanceof BenchmarkApiError && error.status === status);
    }
  } finally { globalThis.fetch = previous; }
});

test('organization creation leaves the initial owner to the server and ownership transfer targets a member ID', async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: 'created', userId: 'joined-member', role: 'OWNER' }), { status: 201 });
  };
  try {
    const api = new BenchmarkApi('https://api.example.test', async () => 'access-token');
    await api.createAdminOrganization({ name: 'Customer organization', type: 'TEAM', ownerUserId: 'untrusted-owner' });
    await api.transferOrganizationOwnership('org/one', 'joined-member');
    assert.equal(requests[0].url, 'https://api.example.test/api/v1/admin/organizations');
    assert.deepEqual(JSON.parse(requests[0].options.body), { name: 'Customer organization', type: 'TEAM' });
    assert.equal(requests[1].url, 'https://api.example.test/api/v1/organizations/org%2Fone/ownership-transfer');
    assert.deepEqual(JSON.parse(requests[1].options.body), { newOwnerUserId: 'joined-member' });
    assert.ok(requests.every(({ options }) => options.method === 'POST' && options.headers.get('Authorization') === 'Bearer access-token'));
  } finally { globalThis.fetch = previous; }
});

test('creation and ownership transfer cannot send requests without an authenticated session', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected unauthenticated request'); };
  try {
    const api = new BenchmarkApi('https://api.example.test', async () => null);
    for (const operation of [api.createAdminOrganization({ name: 'Customer', type: 'TEAM' }), api.transferOrganizationOwnership('org', 'member')]) {
      await assert.rejects(operation, error => error instanceof BenchmarkApiError && error.status === 401);
    }
  } finally { globalThis.fetch = previous; }
});
