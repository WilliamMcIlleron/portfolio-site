// A D1-shaped wrapper over Node's built-in SQLite, running the real migration,
// so the tests exercise the real unique index and the real SQL, not a fake.
// Not a test file itself (no .test. in the name), so node --test skips it.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);

export function mockD1() {
    const db = new DatabaseSync(':memory:');
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
    const statements = [];
    return {
        raw: db,
        statements,
        prepare(sql) {
            statements.push(sql);
            return {
                bind(...args) {
                    return {
                        async first() { return db.prepare(sql).get(...args) ?? null; },
                        async all() { return { results: db.prepare(sql).all(...args) }; },
                        async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
                    };
                },
            };
        },
    };
}

/** A D1 whose every call throws, to prove database failures are handled. */
export function brokenD1() {
    const boom = () => { throw new Error('D1 unavailable'); };
    return { prepare: boom };
}
