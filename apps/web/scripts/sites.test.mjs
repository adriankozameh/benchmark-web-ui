import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BenchmarkApi, BenchmarkApiError } from '../../../packages/api/src/index.ts';
import { canCreateSite, groupStationsBySite, validateSiteName } from '../src/components/stationSiteRules.ts';

test('site creation respects effective plan limits, including retained sites after a downgrade', () => {
  assert.equal(canCreateSite('FREE', 0), true);
  assert.equal(canCreateSite('FREE', 1), false);
  assert.equal(canCreateSite('FREE', 4), false);
  for (const plan of ['PRO', 'PREMIUM']) {
    for (const count of [0, 1, 100]) assert.equal(canCreateSite(plan, count), true);
  }
});

test('site names reject whitespace and enforce the server length limit after trimming', () => {
  for (const name of ['', '  ', '\n\t', 'x'.repeat(201)]) assert.match(validateSiteName(name), /1 to 200/);
  for (const name of ['North Farm', '  North Farm  ', 'x'.repeat(200)]) assert.equal(validateSiteName(name), null);
});

test('grouping keeps empty sites and assigns every station once, including an unknown site', () => {
  const sites = [{ id: 'south', name: 'South Farm' }, { id: 'north', name: 'North Farm' }, { id: 'empty', name: 'New Farm' }];
  const stations = [{ id: '1', siteId: 'north' }, { id: '2', siteId: 'south' }, { id: '3', siteId: 'north' }, { id: '4', siteId: 'not-loaded' }];
  const groups = groupStationsBySite(sites, stations);
  assert.deepEqual(groups.map(group => [group.site?.id ?? null, group.stations.map(station => station.id)]),
    [['south', ['2']], ['north', ['1', '3']], ['empty', []], [null, ['4']]]);
  assert.equal(new Set(groups.flatMap(group => group.stations.map(station => station.id))).size, stations.length);
  assert.equal(sites.length, 3);
  assert.equal(stations.length, 4);
  assert.deepEqual(groupStationsBySite([], []), []);
});

test('site requests encode the organization ID, authenticate and whitelist the creation body', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  const site = { id: 'north', organizationId: 'org/one', name: 'North Farm' };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(options.method === 'POST' ? site : [site]), { status: options.method === 'POST' ? 201 : 200 });
  };
  try {
    const api = new BenchmarkApi('https://api.example.test', async () => 'site-access-token');
    const controller = new AbortController();
    assert.deepEqual(await api.listSites('org/one', controller.signal), [site]);
    assert.deepEqual(await api.createSite('org/one', { name: 'North Farm', organizationId: 'untrusted-org', stations: 20 }), site);
    assert.equal(calls[0].url, 'https://api.example.test/api/v1/organizations/org%2Fone/sites');
    assert.equal(calls[0].options.signal, controller.signal);
    assert.equal(calls[1].url, calls[0].url);
    assert.equal(calls[1].options.method, 'POST');
    assert.equal(calls[1].options.headers.get('Authorization'), 'Bearer site-access-token');
    assert.equal(calls[1].options.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(calls[1].options.body), { name: 'North Farm' });
  } finally { globalThis.fetch = previous; }
});

test('site requests preserve server authorization and capacity conflicts', async () => {
  const previous = globalThis.fetch;
  try {
    const api = new BenchmarkApi('https://api.example.test', async () => 'token');
    for (const status of [401, 403, 409]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Site request rejected' }), { status });
      await assert.rejects(api.createSite('org', { name: 'North Farm' }), error =>
        error instanceof BenchmarkApiError && error.status === status && error.message === 'Site request rejected');
    }
  } finally { globalThis.fetch = previous; }
});

test('site rename and deletion use scoped encoded endpoints and handle a 204 response', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  const site = { id: 'site/two', organizationId: 'org/one', name: 'South Farm' };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return options.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify(site), { status: 200 });
  };
  try {
    const api = new BenchmarkApi('https://api.example.test', async () => 'token');
    assert.deepEqual(await api.renameSite('org/one', 'site/two', 'South Farm'), site);
    assert.equal(await api.deleteSite('org/one', 'site/two'), undefined);
    for (const call of calls) {
      assert.equal(call.url, 'https://api.example.test/api/v1/organizations/org%2Fone/sites/site%2Ftwo');
      assert.equal(call.options.headers.get('Authorization'), 'Bearer token');
    }
    assert.equal(calls[0].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[0].options.body), { name: 'South Farm' });
    assert.equal(calls[1].options.method, 'DELETE');
    assert.equal(calls[1].options.body, undefined);
  } finally { globalThis.fetch = previous; }
});

test('rename and deletion preserve server permission and conflict errors', async () => {
  const previous = globalThis.fetch;
  try {
    const api = new BenchmarkApi('https://api.example.test', async () => 'token');
    for (const status of [401, 403, 404, 409]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Site mutation rejected' }), { status });
      for (const operation of [() => api.renameSite('org', 'site', 'Farm'), () => api.deleteSite('org', 'site')]) {
        await assert.rejects(operation(), error => error instanceof BenchmarkApiError && error.status === status && error.message === 'Site mutation rejected');
      }
    }
  } finally { globalThis.fetch = previous; }
});

test('an expired session cannot send site mutations', async () => {
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Should not call the network'); };
  try {
    const api = new BenchmarkApi('https://api.example.test', async () => null);
    await assert.rejects(api.createSite('org', { name: 'North Farm' }), error => error instanceof BenchmarkApiError && error.status === 401);
    await assert.rejects(api.renameSite('org', 'site', 'South Farm'), error => error instanceof BenchmarkApiError && error.status === 401);
    await assert.rejects(api.deleteSite('org', 'site'), error => error instanceof BenchmarkApiError && error.status === 401);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = previous; }
});
