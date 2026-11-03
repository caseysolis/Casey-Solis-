// ACN Portfolio Simulator — server. Static app, owner-only account storage
// and a server-side quote adapter. No brokerage connection or trade execution.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Auth } from './auth.js';
import { RecordStore } from './store.js';
import { checkWritable } from './fsutil.js';
import { QuoteService, HistoryService } from './quotes/service.js';
import { twelveDataProvider, coinbaseProvider, mockProvider } from './quotes/providers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
const STATIC = [
  { prefix: '/engine/', dir: path.join(ROOT, 'src/engine') },
  { prefix: '/', dir: path.join(ROOT, 'public') },
];

export function createServer(opts = {}) {
  const env = { ...process.env, ...opts.env };
  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));
  const storageReady = checkWritable(dataDir);
  const auth = storageReady ? new Auth(dataDir) : null;
  const store = storageReady ? new RecordStore(dataDir) : null;
  const cookieSecure = env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : env.NODE_ENV === 'production';
  const testHooks = env.ENABLE_TEST_HOOKS === '1';

  const mockControl = { quotes: {}, history: {} };
  let providers = [];
  let historyProvider = null;
  const providerName = env.QUOTE_PROVIDER || (env.TWELVEDATA_API_KEY ? 'twelvedata' : 'none');
  if (providerName === 'mock') {
    if (!testHooks) throw new Error('QUOTE_PROVIDER=mock requires ENABLE_TEST_HOOKS=1 (tests only).');
    providers = [mockProvider(mockControl)];
    historyProvider = providers[0];
  } else if (providerName === 'twelvedata') {
    const td = twelveDataProvider({ apiKey: env.TWELVEDATA_API_KEY, entitlement: env.QUOTE_ENTITLEMENT === 'realtime' ? 'realtime' : 'delayed' });
    providers = [td, coinbaseProvider()];
    historyProvider = td;
  } else if (providerName === 'coinbase-only') {
    providers = [coinbaseProvider()];
  }
  const quotes = new QuoteService({ providers, minIntervalMs: Number(env.QUOTE_MIN_INTERVAL_MS || 20_000) });
  const history = new HistoryService({ provider: historyProvider });

  const blockedStep = !storageReady
    ? `Account storage is blocked: the data directory ${env.DATA_DIR ? '(DATA_DIR)' : './data'} is not writable. Set DATA_DIR to a persistent, writable volume and restart.`
    : null;

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    res.on('finish', () => {
      // Path only — never query strings, bodies, amounts or cookies.
      if (env.LOG_REQUESTS !== '0') console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    });
    setSecurityHeaders(res);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      return serveStatic(url.pathname, res);
    } catch (e) {
      console.error('Unhandled error', e && e.message);
      return json(res, 500, { error: 'Server error' });
    }
  });

  async function api(req, res, url) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/health' && m === 'GET') {
      return json(res, 200, {
        ok: true,
        storage: !storageReady ? 'blocked' : auth.hasUsers() ? 'ready' : 'no-owner',
        storageStep: blockedStep || (storageReady && !auth.hasUsers() ? 'No owner account exists. On the server run: npm run create-user -- you@example.com "a-long-password"' : null),
        quoteProvider: providers.map((x) => x.name),
        quoteConfigured: providers.length > 0,
        historyConfigured: !!historyProvider,
        schema: 1,
      });
    }

    if (m !== 'GET' && m !== 'HEAD' && req.headers['x-acn-client'] !== '1') {
      return json(res, 403, { error: 'Missing client header.' });
    }

    if (!storageReady) return json(res, 503, { error: 'Account storage blocked', step: blockedStep });

    if (p === '/api/auth/login' && m === 'POST') {
      const body = await readBody(req);
      const r = auth.login(body.email, body.password, req.socket.remoteAddress);
      if (!r.ok) return json(res, r.status, { error: r.error });
      res.setHeader('Set-Cookie', cookie('acn_session', r.token, { maxAge: 30 * 24 * 3600, secure: cookieSecure }));
      return json(res, 200, { user: r.user });
    }
    const token = parseCookies(req.headers.cookie).acn_session;
    const user = auth.userFor(token);
    if (p === '/api/auth/logout' && m === 'POST') {
      auth.logout(token);
      res.setHeader('Set-Cookie', cookie('acn_session', '', { maxAge: 0, secure: cookieSecure }));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/auth/me' && m === 'GET') {
      if (!user) return json(res, 401, { error: 'Sign in required.' });
      return json(res, 200, { user });
    }

    if (testHooks && p === '/api/test/mock' && m === 'POST') {
      const body = await readBody(req);
      if (body.reset) { for (const k of Object.keys(mockControl)) delete mockControl[k]; mockControl.quotes = {}; mockControl.history = {}; quotes.cache.clear(); quotes.fetchedAt.clear(); quotes.backoff.clear(); history.cache.clear(); }
      Object.assign(mockControl, body.control || {});
      if (body.expireCache) quotes.fetchedAt.clear();
      return json(res, 200, { ok: true, calls: mockControl.calls || 0 });
    }

    if (!user) return json(res, 401, { error: 'Sign in required.' });

    if (p === '/api/records' && m === 'GET') {
      return json(res, 200, { records: store.list(user.id) });
    }
    let match = p.match(/^\/api\/records\/by-key\/([a-z:]+)$/);
    if (match && m === 'PUT') {
      const body = await readBody(req);
      const r = store.put(user.id, decodeURIComponent(match[1]), body);
      if (r.status !== 200) return json(res, r.status, { error: r.error, current: r.current });
      return json(res, 200, { record: r.record, replay: !!r.replay });
    }
    match = p.match(/^\/api\/records\/([0-9a-f-]{36})$/);
    if (match && m === 'GET') {
      const r = store.get(user.id, match[1]);
      return r ? json(res, 200, { record: r }) : json(res, 404, { error: 'Not found' });
    }
    if (match && m === 'DELETE') {
      return store.delete(user.id, match[1]) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Not found' });
    }

    if (p === '/api/quotes' && m === 'GET') {
      const symbols = QuoteService.sanitize(url.searchParams.get('symbols'));
      if (!symbols.length) return json(res, 400, { error: 'No supported symbols requested.' });
      if (!providers.length) {
        return json(res, 200, { configured: false, quotes: Object.fromEntries(symbols.map((s) => [s, { symbol: s, error: 'No quote provider configured', status: 'unavailable' }])), serverTime: new Date().toISOString() });
      }
      const q = await quotes.get(symbols);
      return json(res, 200, { configured: true, quotes: q, provider: quotes.status(), serverTime: new Date().toISOString() });
    }
    if (p === '/api/history' && m === 'GET') {
      const symbols = QuoteService.sanitize(url.searchParams.get('symbols'));
      const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : null;
      if (!symbols.length || !from) return json(res, 400, { error: 'symbols and from=YYYY-MM-DD are required.' });
      const h = await history.get(symbols, from);
      return json(res, 200, { configured: !!historyProvider, history: h });
    }
    return json(res, 404, { error: 'Not found' });
  }

  return { server, auth, store, quotes, mockControl, dataDir };
}

function serveStatic(pathname, res) {
  if (pathname === '/' || !path.extname(pathname)) pathname = '/index.html';
  for (const { prefix, dir } of STATIC) {
    if (!pathname.startsWith(prefix)) continue;
    const rel = decodeURIComponent(pathname.slice(prefix.length));
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir + path.sep)) continue;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': pathname === '/index.html' || pathname === '/sw.js' ? 'no-cache' : 'no-cache',
    });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

function setSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 2_500_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('Body too large');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

function parseCookies(h = '') {
  return Object.fromEntries(h.split(';').map((x) => x.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function cookie(name, value, { maxAge, secure }) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  const { server } = createServer();
  server.listen(port, () => console.log(`ACN Portfolio Simulator listening on http://localhost:${port}`));
}
