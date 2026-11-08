import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

/** Temporary real SQLite services; external model/network access is forbidden. */
export async function localRuntime() {
  const directory = await mkdtemp(join(tmpdir(), 'sixteen-full-integration-'));
  const config = JSON.parse(await readFile(new URL('../../../wrangler.jsonc', import.meta.url)));
  const administrator = 'synthetic-full-integration-administrator-only';
  let runtime;
  let outboundCalls = 0;
  try {
    const definitions = [];
    for (const [name, source] of [['v010', '../../../test/fixtures/v010/index.ts'], ['v021', '../../../worker/index.ts']]) {
      const scriptPath = join(directory, name + '.js');
      await build({
        entryPoints: [fileURLToPath(new URL(source, import.meta.url))], outfile: scriptPath,
        bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', keepNames: true,
        external: ['cloudflare:workers', 'node:crypto'], logLevel: 'silent',
      });
      definitions.push({ name, scriptPath });
    }
    runtime = new Miniflare({
      ...convertV4MiniflareOptions({ workers: definitions.map(({ name, scriptPath }) => ({
        name, scriptPath, modulesRoot: dirname(scriptPath), modules: true,
        compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
        bindings: { ...config.vars, PROJECT_ID: name, ADMIN_KEY: administrator, EXTRACTION_ENABLED: 'false', EMBEDDINGS_ENABLED: 'false' },
        serviceBindings: { ASSETS: () => new Response('local test assets') },
        durableObjects: { PROJECTS: { className: 'MemoryProject', useSQLite: true } },
        ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
        outboundService: () => { outboundCalls++; return new Response('External calls forbidden', { status: 503 }); },
      })) }),
      resourcePersistencePath: join(directory, 'state'),
    });
    return {
      directory, administrator,
      outboundCalls: () => outboundCalls,
      async transport(name) {
        const worker = await runtime.getWorker(name);
        return (url, init = {}) => worker.fetch(url, {
          ...init, headers: { ...init.headers, 'CF-Connecting-IP': crypto.randomUUID() },
        });
      },
      async dispose() { await runtime.dispose(); await rm(directory, { recursive: true, force: true }); },
    };
  } catch (error) {
    await runtime?.dispose();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
