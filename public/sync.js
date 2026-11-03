// Client sync: authenticated server storage is the source of truth; the
// device cache only supports offline use and is cleared on sign-out.

const PREFIX = 'acn:';

function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } }

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-acn-client': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

function editId() {
  const r = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `e_${r}`;
}

export class Sync {
  constructor({ onStatus, onConflict }) {
    this.onStatus = onStatus;
    this.onConflict = onConflict;
    this.userId = null;
    this.meta = {}; // key → { id, revision }
    this.data = {}; // key → latest local data
    this.queue = []; // [{ editId, key, attempted }]
    this.state = 'idle';
    this.flushing = false;
    this.timer = null;
    this.conflicts = {};
    window.addEventListener('online', () => this.reconnect());
  }

  cacheKey() { return `${PREFIX}${this.userId}:cache`; }

  setUser(userId) {
    this.userId = userId;
    lsSet(`${PREFIX}lastUser`, userId);
  }

  static lastUser() { return lsGet(`${PREFIX}lastUser`); }

  loadCache() {
    const c = lsGet(this.cacheKey());
    if (!c) return null;
    this.meta = c.meta || {};
    this.data = c.data || {};
    this.queue = (c.queue || []).map((q) => ({ ...q, attempted: false }));
    return c;
  }

  persist() {
    if (!this.userId) return;
    const ok = lsSet(this.cacheKey(), { meta: this.meta, data: this.data, queue: this.queue, savedAt: new Date().toISOString() });
    this.deviceCache = ok ? 'ok' : 'unavailable';
  }

  /** Apply the server's records. Keys with pending local edits keep local data. */
  applyServer(records) {
    const pendingKeys = new Set(this.queue.map((q) => q.key));
    const changed = [];
    for (const r of records) {
      const cur = this.meta[r.key];
      if (pendingKeys.has(r.key)) {
        if (!cur) this.meta[r.key] = { id: r.id, revision: r.revision };
        continue;
      }
      if (!cur || cur.revision !== r.revision || cur.id !== r.id) {
        this.meta[r.key] = { id: r.id, revision: r.revision };
        this.data[r.key] = r.data;
        changed.push(r.key);
      }
    }
    this.persist();
    return changed;
  }

  save(key, data) {
    this.data[key] = data;
    const pending = this.queue.find((q) => q.key === key && !q.sending);
    if (pending) { pending.editId = editId(); pending.attempted = false; } else this.queue.push({ editId: editId(), key, attempted: false });
    this.persist();
    this.setState(navigator.onLine === false ? 'offline' : 'saving');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  setState(s) {
    this.state = s;
    this.onStatus && this.onStatus(s, this.queue.length);
  }

  async flush({ reconnect = false } = {}) {
    if (this.flushing || !this.userId) return;
    this.flushing = true;
    try {
      for (const item of [...this.queue]) {
        if (this.conflicts[item.key]) continue;
        if (reconnect) { if (item.attempted) continue; item.attempted = true; }
        const m = this.meta[item.key] || { revision: 0 };
        item.sending = true;
        let res;
        try {
          res = await api('PUT', `/api/records/by-key/${encodeURIComponent(item.key)}`, { baseRevision: m.revision, data: this.data[item.key], editId: item.editId });
        } catch {
          item.sending = false;
          this.persist();
          this.setState('offline');
          return;
        }
        item.sending = false;
        if (res.status === 200) {
          this.meta[item.key] = { id: res.data.record.id, revision: res.data.record.revision };
          // Only drop the entry if no newer local edit replaced it while sending.
          const idx = this.queue.indexOf(item);
          if (idx >= 0 && this.queue[idx].editId === item.editId) this.queue.splice(idx, 1);
        } else if (res.status === 409) {
          this.conflicts[item.key] = res.data.current;
          this.persist();
          this.setState('conflict');
          this.onConflict && this.onConflict(item.key, res.data.current);
        } else if (res.status === 401) {
          this.setState('signed-out');
          return;
        } else {
          this.lastError = res.status;
          this.persist();
          this.setState('error');
          return;
        }
      }
      this.persist();
      if (Object.keys(this.conflicts).length) this.setState('conflict');
      else this.setState(this.queue.length ? 'saving' : 'saved');
      if (this.queue.some((q) => !this.conflicts[q.key])) setTimeout(() => this.flush(), 50);
    } finally {
      this.flushing = false;
    }
  }

  /** On reconnect, retry once per unique pending edit. */
  reconnect() {
    for (const q of this.queue) q.attempted = false;
    return this.flush({ reconnect: true });
  }

  resolveConflict(key, choice) {
    const current = this.conflicts[key];
    delete this.conflicts[key];
    if (choice === 'theirs') {
      this.queue = this.queue.filter((q) => q.key !== key);
      if (current) { this.meta[key] = { id: current.id, revision: current.revision }; this.data[key] = current.data; }
      this.persist();
      this.setState(this.queue.length ? 'saving' : 'saved');
      return current ? current.data : null;
    }
    // Keep mine: rebase on the server revision and re-send.
    this.meta[key] = current ? { id: current.id, revision: current.revision } : { revision: 0 };
    const pending = this.queue.find((q) => q.key === key);
    if (pending) { pending.editId = editId(); pending.attempted = false; }
    this.persist();
    this.flush();
    return this.data[key];
  }

  clearAll() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
      keys.forEach(lsDel);
    } catch { /* storage unavailable */ }
    this.userId = null;
    this.meta = {};
    this.data = {};
    this.queue = [];
    this.conflicts = {};
  }
}
