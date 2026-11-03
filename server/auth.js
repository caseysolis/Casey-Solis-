// Owner accounts and sessions. Passwords are scrypt-hashed; sessions are
// random 256-bit tokens in an HttpOnly, SameSite=Strict cookie.
import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { readJSON, writeJSONAtomic } from './fsutil.js';
import path from 'node:path';

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export class Auth {
  constructor(dataDir) {
    this.usersFile = path.join(dataDir, 'users.json');
    this.sessionsFile = path.join(dataDir, 'sessions.json');
    this.users = readJSON(this.usersFile, []);
    this.sessions = readJSON(this.sessionsFile, {});
    this.failures = new Map();
  }

  hasUsers() {
    this.users = readJSON(this.usersFile, this.users);
    return this.users.length > 0;
  }

  createUser(email, password) {
    email = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (String(password).length < 10) throw new Error('Password must be at least 10 characters.');
    this.users = readJSON(this.usersFile, []);
    if (this.users.some((u) => u.email === email)) throw new Error('That account already exists.');
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(String(password), salt, 64).toString('hex');
    const user = { id: randomUUID(), email, salt, hash, createdAt: new Date().toISOString() };
    this.users.push(user);
    writeJSONAtomic(this.usersFile, this.users);
    return { id: user.id, email: user.email };
  }

  login(email, password, ip = '') {
    const key = `${ip}|${String(email).toLowerCase()}`;
    const f = this.failures.get(key) || { n: 0, until: 0 };
    if (f.until > Date.now()) return { ok: false, status: 429, error: 'Too many attempts. Try again shortly.' };
    this.users = readJSON(this.usersFile, this.users);
    const user = this.users.find((u) => u.email === String(email).trim().toLowerCase());
    let ok = false;
    if (user) {
      const h = scryptSync(String(password ?? ''), user.salt, 64);
      ok = timingSafeEqual(h, Buffer.from(user.hash, 'hex'));
    } else {
      scryptSync('dummy-password', 'dummy-salt-value', 64); // equalize timing
    }
    if (!ok) {
      f.n += 1;
      if (f.n >= 5) { f.until = Date.now() + 60_000 * Math.min(15, f.n - 4); }
      this.failures.set(key, f);
      return { ok: false, status: 401, error: 'Email or password is incorrect.' };
    }
    this.failures.delete(key);
    const token = randomBytes(32).toString('base64url');
    this.sessions[token] = { userId: user.id, expires: Date.now() + SESSION_TTL_MS };
    this.persistSessions();
    return { ok: true, token, user: { id: user.id, email: user.email } };
  }

  logout(token) {
    if (token && this.sessions[token]) {
      delete this.sessions[token];
      this.persistSessions();
    }
  }

  userFor(token) {
    if (!token) return null;
    const s = this.sessions[token];
    if (!s) return null;
    if (s.expires < Date.now()) { delete this.sessions[token]; this.persistSessions(); return null; }
    const u = this.users.find((x) => x.id === s.userId);
    return u ? { id: u.id, email: u.email } : null;
  }

  persistSessions() {
    const now = Date.now();
    for (const [k, v] of Object.entries(this.sessions)) if (v.expires < now) delete this.sessions[k];
    writeJSONAtomic(this.sessionsFile, this.sessions);
  }
}
