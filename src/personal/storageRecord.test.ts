import { describe, expect, it } from 'vitest';
import {
  BACKUP_SUFFIX, QUARANTINE_SUFFIX, guardedWrite, readQuarantine, recordRevision, stampRecord, type RecordStorage,
} from './storageRecord';

function memoryStorage(initial: Record<string, string> = {}): RecordStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}
const clean = (raw: string) => { try { return JSON.parse(raw).version === 1; } catch { return false; } };

describe('versioned storage records', () => {
  it('stamps a schema record with a revision and updatedAt, replacing any earlier stamp', () => {
    const stamped = JSON.parse(stampRecord({ version: 1, items: [1], revision: 'old', updatedAt: 'x' }, '2027-01-01T00:00:00.000Z'));
    expect(stamped).toMatchObject({ version: 1, items: [1], updatedAt: '2027-01-01T00:00:00.000Z' });
    expect(stamped.revision).toMatch(/^[a-zA-Z0-9-]{8,56}$/);
    expect(stamped.revision).not.toBe('old');
  });

  it('identifies a stored value by its revision, or by content when it predates revisions', () => {
    expect(recordRevision(null)).toBe('missing');
    expect(recordRevision('{"version":1,"revision":"abc-1"}')).toBe('abc-1');
    expect(recordRevision('{"version":1}')).toBe(recordRevision('{"version":1}'));
    expect(recordRevision('{"version":1}')).not.toBe(recordRevision('{"version":1,"x":2}'));
    expect(recordRevision('1.["US"]')).toMatch(/^h:/);
  });

  it('refuses a write when another tab saved a newer revision after this one loaded, keeping the newer data', () => {
    const storage = memoryStorage();
    const loadedByA = recordRevision(storage.getItem('k'));
    const loadedByB = recordRevision(storage.getItem('k'));
    expect(guardedWrite(storage, 'k', stampRecord({ version: 1, from: 'B' }), { expectedRevision: loadedByB, isClean: clean }).status).toBe('saved');
    const stale = guardedWrite(storage, 'k', stampRecord({ version: 1, from: 'A' }), { expectedRevision: loadedByA, isClean: clean });
    expect(stale.status).toBe('stale');
    expect(JSON.parse(storage.getItem('k')!).from).toBe('B');
  });

  it('keeps a backup of a legacy record before its first versioned write', () => {
    const legacy = '{"version":1,"requests":[]}';
    const storage = memoryStorage({ k: legacy });
    expect(guardedWrite(storage, 'k', stampRecord({ version: 1, requests: ['new'] }), { expectedRevision: recordRevision(legacy), isClean: clean }).status).toBe('saved');
    expect(JSON.parse(storage.getItem(`k${BACKUP_SUFFIX}`)!)).toMatchObject({ version: 1, reason: 'migration', raw: legacy });
    // Later versioned writes leave the migration backup alone.
    const current = storage.getItem('k');
    guardedWrite(storage, 'k', stampRecord({ version: 1, requests: [] }), { expectedRevision: recordRevision(current), isClean: clean });
    expect(JSON.parse(storage.getItem(`k${BACKUP_SUFFIX}`)!).raw).toBe(legacy);
  });

  it('quarantines corrupt JSON before replacing it, and never replaces it when the copy cannot be kept', () => {
    const storage = memoryStorage({ k: '{"version":1,"requests":[' });
    const result = guardedWrite(storage, 'k', stampRecord({ version: 1, requests: [] }), { isClean: clean });
    expect(result).toMatchObject({ status: 'saved', quarantined: true });
    expect(readQuarantine(storage, 'k').map(entry => entry.raw)).toEqual(['{"version":1,"requests":[']);

    const full = memoryStorage({ k: 'not json' });
    full.setItem = (key, value) => { if (key.endsWith(QUARANTINE_SUFFIX)) throw new Error('quota'); full.data.set(key, value); };
    expect(guardedWrite(full, 'k', stampRecord({ version: 1 }), { isClean: clean }).status).toBe('unavailable');
    expect(full.getItem('k')).toBe('not json');
  });

  it('refuses to downgrade a record written by a newer app version', () => {
    const newer = '{"version":2,"requests":[]}';
    const storage = memoryStorage({ k: newer });
    const result = guardedWrite(storage, 'k', stampRecord({ version: 1 }), { isClean: clean, isNewer: raw => JSON.parse(raw).version > 1 });
    expect(result.status).toBe('newer-version');
    expect(storage.getItem('k')).toBe(newer);
  });

  it('keeps the three most recent quarantined copies', () => {
    const storage = memoryStorage();
    for (const raw of ['a', 'b', 'c', 'd']) {
      storage.setItem('k', raw);
      guardedWrite(storage, 'k', stampRecord({ version: 1 }), { isClean: clean });
    }
    expect(readQuarantine(storage, 'k').map(entry => entry.raw)).toEqual(['b', 'c', 'd']);
  });

  it('reports storage that throws as unavailable without changing anything', () => {
    const broken: RecordStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(guardedWrite(broken, 'k', '{}', { isClean: clean }).status).toBe('unavailable');
  });
});
