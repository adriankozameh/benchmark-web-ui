import test from 'node:test';
import assert from 'node:assert/strict';
import { BenchmarkApi } from '../../../packages/api/src/index.ts';
import { HARDWARE_PROVIDERS } from '../src/components/hardwareProviders.ts';

const providers = [
  ['ACUITY', 'token', false],
  ['CIMIS', 'apiKey', false],
  ['LICOR_HOBO', 'token', false],
  ['METER', 'token', true],
  ['VAISALA', 'apiKey', true],
];

for (const [provider, credential, needsStation] of providers) {
  test(`${provider} can be selected and saved with the required credentials`, async () => {
    const definition = HARDWARE_PROVIDERS.find(item => item.id === provider);
    assert.ok(definition);
    assert.deepEqual(definition.fields, [credential]);
    assert.equal(Boolean(definition.requiresVerificationStation), needsStation);
    const original = globalThis.fetch;
    let sent;
    globalThis.fetch = async (url, options) => {
      sent = { url, options };
      return new Response(JSON.stringify({ id: 'account', provider }), { status: 201 });
    };
    try {
      const api = new BenchmarkApi('https://api.example.com', async () => 'access-token');
      const input = { name: 'Hardware', provider, [credential]: 'vendor-credential',
        ...(needsStation ? { verificationStationId: 'vendor-station' } : {}) };
      await api.createDataProvider('org', input);
      assert.equal(sent.url, 'https://api.example.com/api/v1/organizations/org/data-providers');
      assert.deepEqual(JSON.parse(sent.options.body), input);
      assert.equal(sent.options.headers.get('Authorization'), 'Bearer access-token');
    } finally { globalThis.fetch = original; }
  });
}

test('credential rotation sends the test station when changed and omits unchanged credentials', async () => {
  const original = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: 'account' }), { status: 200 });
  };
  try {
    const api = new BenchmarkApi('https://api.example.com', async () => 'access-token');
    await api.updateDataProvider('org', 'account', { token: 'new-token', verificationStationId: 'z6-12345' });
    await api.updateDataProvider('org', 'account', { name: 'Renamed' });
    assert.deepEqual(bodies, [{ token: 'new-token', verificationStationId: 'z6-12345' }, { name: 'Renamed' }]);
  } finally { globalThis.fetch = original; }
});
