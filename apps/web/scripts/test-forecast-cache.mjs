import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../../../packages/api/src/index.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { BenchmarkApi } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let now, calls;
function fixture() {
  now = Date.parse('2026-09-29T12:15:00Z'); calls = 0;
  Date.now = () => now;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ expiresAt: '2026-09-29T13:00:00Z', notices: [], products: { hourly: [], daily: [] } }));
  };
  return new BenchmarkApi('https://example.invalid', async () => 'token');
}
test.after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; });
test('deduplicates concurrent requests and reuses responses across navigation', async () => {
  const api = fixture();
  const [a, b] = await Promise.all([api.getForecastProducts('org', 'station', 15, 'safecast'), api.getForecastProducts('org', 'station', 15, 'safecast')]);
  assert.equal(calls, 1); assert.equal(a, b);
  assert.equal(await api.getForecastProducts('org', 'station', 15, 'safecast'), a);
  assert.equal(calls, 1);
  assert.equal(api.getCachedForecastProducts('org', 'station', 15, 'safecast'), a);
});
test('revalidates after one minute and explicit refresh bypasses browser cache', async () => {
  const api = fixture();
  await api.getForecastProducts('org', 'station', 15, 'safecast');
  now += 61_000;
  await api.getForecastProducts('org', 'station', 15, 'safecast'); assert.equal(calls, 2);
  await api.getForecastProducts('org', 'station', 15, 'safecast', '', true); assert.equal(calls, 3);
});
test('hour expiry, product, tenant and station revision isolate entries', async () => {
  const api = fixture();
  await api.getForecastProducts('org', 'station', 15, 'safecast', 'v1');
  for (const args of [['org', 'station', 15, 'burncast', 'v1'], ['other', 'station', 15, 'safecast', 'v1'], ['org', 'station', 15, 'safecast', 'v2']]) {
    assert.equal(api.getCachedForecastProducts(...args), null);
  }
  now = Date.parse('2026-09-29T13:00:00Z');
  assert.equal(api.getCachedForecastProducts('org', 'station', 15, 'safecast', 'v1'), null);
});
test('clearing cache while a request is pending prevents repopulation after logout', async () => {
  const api = fixture(); let complete;
  globalThis.fetch = async () => new Promise(resolve => { complete = resolve; });
  const request = api.getForecastProducts('org', 'station', 15, 'safecast');
  await Promise.resolve(); await Promise.resolve();
  api.clearForecastCache();
  complete(new Response(JSON.stringify({ expiresAt: '2026-09-29T13:00:00Z', notices: [] })));
  await request;
  assert.equal(api.getCachedForecastProducts('org', 'station', 15, 'safecast'), null);
});
test('pending enrichment revalidates quickly, and failed requests are retryable', async () => {
  const api = fixture();
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ expiresAt: '2026-09-29T13:00:00Z', notices: ['ENRICHMENT_PENDING'] })); };
  await api.getForecastProducts('org', 'station', 15, 'burncast');
  now += 5_001;
  await api.getForecastProducts('org', 'station', 15, 'burncast'); assert.equal(calls, 2);
  globalThis.fetch = async () => new Response('{}', { status: 403 });
  await assert.rejects(api.getForecastProducts('org', 'station', 15, 'burncast', '', true));
  assert.equal(api.getCachedForecastProducts('org', 'station', 15, 'burncast'), null);
});
