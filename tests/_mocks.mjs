// Shared test doubles: an in-memory KV namespace and a fetch router.
// Not a test file itself (no .test. in the name), so node --test skips it.

export function mockKV(initial = {}) {
    const store = new Map(Object.entries(initial).map(([k, v]) => [k, { value: v, opts: {} }]));
    const puts = [];
    return {
        store,
        puts,
        async get(key) {
            const e = store.get(key);
            return e ? e.value : null;
        },
        async put(key, value, opts = {}) {
            puts.push({ key, value, opts });
            store.set(key, { value: String(value), opts });
        },
        async delete(key) { store.delete(key); },
        ttl(key) { return store.get(key)?.opts?.expirationTtl; },
    };
}

/** A KV whose every call throws, to prove failures are handled. */
export function brokenKV() {
    const boom = async () => { throw new Error('KV unavailable'); };
    return { get: boom, put: boom, delete: boom };
}

/**
 * fetch double. routes: array of [matcher(url, init) => boolean, handler(url, init) => Response].
 * Anything unmatched throws, so a test fails loudly if code reaches the network.
 */
export function mockFetch(routes) {
    const calls = [];
    const f = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        calls.push({ url, init });
        for (const [match, handle] of routes) {
            if (match(url, init)) return handle(url, init);
        }
        throw new Error('unexpected fetch: ' + url);
    };
    f.calls = calls;
    return f;
}

export const startsWith = (prefix) => (url) => String(url).startsWith(prefix);

export const turnstileOk = [startsWith('https://challenges.cloudflare.com/'), () => Response.json({ success: true })];
export const turnstileFail = [startsWith('https://challenges.cloudflare.com/'), () => Response.json({ success: false, 'error-codes': ['invalid-input-response'] })];
export const dohPublic = [startsWith('https://cloudflare-dns.com/'), () => Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] })];
export const dohPrivate = [startsWith('https://cloudflare-dns.com/'), () => Response.json({ Status: 0, Answer: [{ type: 1, data: '10.0.0.1' }] })];

export function htmlResponse(body, status = 200) {
    return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/** Install a fetch double on globalThis for the duration of fn. */
export async function withFetch(f, fn) {
    const orig = globalThis.fetch;
    globalThis.fetch = f;
    try { return await fn(); } finally { globalThis.fetch = orig; }
}

/** Silence console output from the code under test, but keep it for assertions. */
export async function captureLogs(fn) {
    const lines = [];
    const orig = { log: console.log, warn: console.warn, error: console.error };
    for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.map(String).join(' '));
    try { const result = await fn(); return { result, lines }; } finally { Object.assign(console, orig); }
}
