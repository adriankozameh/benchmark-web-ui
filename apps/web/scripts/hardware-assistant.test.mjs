import test from 'node:test';
import assert from 'node:assert/strict';
import { BenchmarkApi, BenchmarkApiError } from '../../../packages/api/src/index.ts';
import { hardwareHistory } from '../src/components/hardwareProviders.ts';

test('hardware messages use the authenticated organization endpoint and abort signal', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options };
    return new Response(JSON.stringify({ message: 'Choose your provider.' }), { status: 200 });
  };
  try {
    const api = new BenchmarkApi('https://api.example.com', async () => 'access-token');
    const input = { message: 'Help with Tempest', provider: 'TEMPEST', language: 'en', history: [] };
    assert.deepEqual(await api.askHardwareAssistant('org/one', input, controller.signal),
      { message: 'Choose your provider.' });
    assert.equal(sent.url, 'https://api.example.com/api/v1/organizations/org%2Fone/hardware-assistant/messages');
    assert.equal(sent.options.headers.get('Authorization'), 'Bearer access-token');
    assert.equal(sent.options.signal, controller.signal);
    assert.deepEqual(JSON.parse(sent.options.body), input);
  } finally { globalThis.fetch = original; }
});

test('history drops UI fields and remains within the server limits', () => {
  const turns = Array.from({ length: 30 }, (_, n) => ({ role: n % 2 ? 'assistant' : 'user',
    content: String(n).padEnd(5000, 'x'), id: String(n), credentials: 'not-a-chat-field' }));
  const history = hardwareHistory(turns);
  assert.equal(history.length, 12);
  assert.equal(history[0].content.startsWith('18'), true);
  assert.equal(history.every(turn => turn.content.length === 4000), true);
  assert.deepEqual(Object.keys(history[0]), ['role', 'content']);
});

test('an expired login never sends a chat request', async () => {
  const api = new BenchmarkApi('https://api.example.com', async () => null);
  await assert.rejects(api.askHardwareAssistant('org', { message: 'Help', provider: null,
    language: 'en', history: [] }), error => error instanceof BenchmarkApiError && error.status === 401);
});
