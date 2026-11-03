// Owner-scoped record storage with revision-based conflict detection.
// Every read, write and delete is authorized against the record's owner.
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJSON, writeJSONAtomic } from './fsutil.js';

const KEY_RE = /^(profile|tab:(myacn|low|central|high))$/;
const MAX_RECORD_BYTES = 2_000_000;

export class RecordStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'records.json');
    this.records = readJSON(this.file, {});
  }

  persist() { writeJSONAtomic(this.file, this.records); }

  list(ownerId) {
    return Object.values(this.records).filter((r) => r.ownerId === ownerId).map(publicView);
  }

  get(ownerId, id) {
    const r = this.records[id];
    if (!r || r.ownerId !== ownerId) return null; // never reveal other owners' records
    return publicView(r);
  }

  /**
   * Create or update by key. baseRevision must match the stored revision
   * (0 for a new record). A retried editId that was already applied returns
   * the stored result instead of a conflict.
   */
  put(ownerId, key, { baseRevision, data, editId }) {
    if (!KEY_RE.test(key)) return { status: 400, error: 'Unknown record key.' };
    if (!Number.isInteger(baseRevision) || baseRevision < 0) return { status: 400, error: 'baseRevision is required.' };
    if (typeof editId !== 'string' || editId.length < 8 || editId.length > 100) return { status: 400, error: 'editId is required.' };
    const size = Buffer.byteLength(JSON.stringify(data ?? null));
    if (size > MAX_RECORD_BYTES) return { status: 413, error: 'Record too large.' };
    let rec = Object.values(this.records).find((r) => r.ownerId === ownerId && r.key === key);
    if (rec && rec.recentEdits.includes(editId)) return { status: 200, record: publicView(rec), replay: true };
    if (!rec) {
      if (baseRevision !== 0) return { status: 409, error: 'Record no longer exists.', current: null };
      rec = { id: randomUUID(), ownerId, key, revision: 0, recentEdits: [] };
    } else if (rec.revision !== baseRevision) {
      return { status: 409, error: 'This record changed on another device.', current: publicView(rec) };
    }
    rec.revision += 1;
    rec.data = data;
    rec.updatedAt = new Date().toISOString();
    rec.recentEdits = [...rec.recentEdits, editId].slice(-50);
    this.records[rec.id] = rec;
    this.persist();
    return { status: 200, record: publicView(rec) };
  }

  delete(ownerId, id) {
    const r = this.records[id];
    if (!r || r.ownerId !== ownerId) return false;
    delete this.records[id];
    this.persist();
    return true;
  }
}

function publicView(r) {
  return { id: r.id, key: r.key, revision: r.revision, updatedAt: r.updatedAt, data: r.data };
}
