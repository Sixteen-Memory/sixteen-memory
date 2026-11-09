import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localRuntime } from './local-runtime.mjs';

const runtime = await localRuntime();
const originalFetch = globalThis.fetch;
const checks = [];
try {
  const outfile = join(runtime.directory, 'console-api.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../../../src/api.ts', import.meta.url))], outfile, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
  const { api } = await import(pathToFileURL(outfile).href);
  for (const version of ['v010', 'v021']) {
    const transport = await runtime.transport(version);
    let cookie = '';
    const requests = [];
    globalThis.fetch = async (path, init = {}) => {
      assert.ok(path.startsWith('/'), 'Console calls must stay same-origin');
      assert.equal(init.headers.Authorization, undefined, 'Console must not embed a bearer key');
      const response = await transport('https://memory.example' + path, { ...init, headers: { ...init.headers, ...(cookie ? { Cookie: cookie } : {}) } });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      requests.push(path);
      return response;
    };
    assert.equal((await api.login(runtime.administrator)).role, 'admin');
    const key = await api.createKey({ name: 'Console writer', user_id: 'alice', role: 'write' });
    assert.equal((await api.keys()).length, 1);
    await api.logout();
    assert.equal((await api.login(key.key)).user_id, 'alice');
    assert.equal((await api.me()).role, 'write');
    const input = {
      user_id: 'alice', request_id: 'console-synthetic', content: 'Concise replies.',
      source: { type: 'manual', ref: 'console-example', text: 'Concise replies.', observed_at: '2026-11-08T00:00:00Z' },
      expires_at: null,
    };
    const saved = await api.add(input);
    assert.equal((await api.list({ status: 'active' })).data[0].id, saved.id);
    assert.equal((await api.search('concise', 'alice')).data[0].id, saved.id);
    const updated = await api.update(saved.id, { ...input, content: 'Detailed replies.', expected_version: saved.version, reason: 'Correction' });
    await assert.rejects(api.delete(saved.id, saved.version), error => error.status === 409);
    assert.equal((await api.history(saved.id)).length, 2);
    assert.equal((await api.exportPage({ user_id: 'alice' })).data[0].content, 'Detailed replies.');
    if (version === 'v021') {
      assert.deepEqual(await api.ingestions('alice'), []);
      assert.equal((await api.evidence(saved.id)).version, updated.version);
      assert.equal((await api.context({ user_id: 'alice', query: 'Detailed' })).memories[0].id, saved.id);
      assert.equal((await api.searchEvidence({ user_id: 'alice', query: 'Concise' })).data[0].memory_id, saved.id);
      assert.equal((await api.reviewMemories({ user_id: 'alice' })).changed, 0);
      await assert.rejects(api.search('detailed', 'alice', 'semantic'), error => error.status === 503);
    }
    await assert.rejects(api.list({ user_id: 'bob' }), error => error.status === 404);
    const revoked = await api.revoke(saved.id, updated.version, 'Deactivation');
    assert.equal((await api.search('detailed', 'alice')).data.length, 0);
    await api.delete(saved.id, revoked.version);
    await api.logout();
    await assert.rejects(api.me(), error => error.status === 401);
    checks.push({ version, console_api: 'passed', cookie_sessions: true, typed_lifecycle: true, requests: requests.length });
  }
  assert.equal(runtime.outboundCalls(), 0);
  console.log(JSON.stringify({ status: 'passed', checks, provider_calls: 0 }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  await runtime.dispose();
}
