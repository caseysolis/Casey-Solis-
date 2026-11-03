import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/server.js';

export async function startServer(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acn-sim-'));
  const ctx = createServer({ env: { DATA_DIR: dataDir, LOG_REQUESTS: '0', ENABLE_TEST_HOOKS: '1', QUOTE_PROVIDER: 'mock', QUOTE_MIN_INTERVAL_MS: '0', ...env } });
  await new Promise((r) => ctx.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${ctx.server.address().port}`;
  return {
    ...ctx,
    base,
    async close() {
      ctx.server.closeAllConnections();
      await new Promise((r) => ctx.server.close(r));
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Minimal cookie-jar client representing one isolated browser identity. */
export function client(base) {
  let cookie = '';
  return {
    async req(method, p, body, headers = {}) {
      const res = await fetch(base + p, {
        method,
        headers: { 'content-type': 'application/json', 'x-acn-client': '1', ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, data };
    },
    get cookie() { return cookie; },
  };
}
