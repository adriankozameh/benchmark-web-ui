import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/memberRemoval.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { removeMemberAndConfirm } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function api(remove, list) {
  let deletes = 0;
  let reads = 0;
  return {
    removeMember: async (org, user, signal) => {
      assert.equal(org, 'org'); assert.equal(user, 'target'); deletes++;
      return remove(signal);
    },
    listMembers: async (org, signal) => {
      assert.equal(org, 'org'); reads++; return list(signal);
    },
    counts: () => ({ deletes, reads }),
  };
}

test('successful DELETE resolves without waiting for a second request', async () => {
  const client = api(() => undefined, () => new Promise(() => {}));
  await removeMemberAndConfirm(client, 'org', 'target', 10);
  assert.deepEqual(client.counts(), { deletes: 1, reads: 0 });
});

test('committed deletion with lost response is confirmed by list, without another DELETE', async () => {
  let signal;
  const client = api(s => { signal = s; return new Promise(() => {}); }, () => []);
  await removeMemberAndConfirm(client, 'org', 'target', 10);
  assert.equal(signal.aborted, true);
  assert.deepEqual(client.counts(), { deletes: 1, reads: 1 });
});

test('404 after an earlier removal is reconciled as success', async () => {
  const client = api(() => { throw Object.assign(new Error('Not found'), {status: 404}); }, () => []);
  await removeMemberAndConfirm(client, 'org', 'target', 10);
});

test('failed removal of a still-present member remains an error', async () => {
  const failure = new Error('Server failure');
  const client = api(() => { throw failure; }, () => [{ userId: 'target' }]);
  await assert.rejects(removeMemberAndConfirm(client, 'org', 'target', 10), error => error === failure);
});

test('both requests hanging still terminates with an explicit unconfirmed error', async () => {
  const client = api(() => new Promise(() => {}), () => new Promise(() => {}));
  await assert.rejects(removeMemberAndConfirm(client, 'org', 'target', 10), /Could not confirm member removal/);
  assert.deepEqual(client.counts(), { deletes: 1, reads: 1 });
});

test('permission and authentication failures are preserved', async () => {
  for (const status of [401, 403]) {
    const failure = Object.assign(new Error('Access denied'), { status });
    const client = api(() => { throw failure; }, () => []);
    await assert.rejects(removeMemberAndConfirm(client, 'org', 'target', 10), error => error === failure);
    assert.deepEqual(client.counts(), { deletes: 1, reads: 0 });
  }
});
