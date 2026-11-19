/* ==========================================================================
   URL guard for the site checker. Decides whether a visitor-typed address may
   be fetched at all. Pure functions plus one DNS-over-HTTPS lookup.

   Order of defence:
     1. normalizeInput(): scheme, userinfo, port and hostname-shape rules. Uses
        the WHATWG URL parser, which already rewrites decimal, octal and hex
        IPv4 forms (2130706433, 0x7f.1) to dotted quads, so one check catches
        them all.
     2. checkTarget(): resolves A and AAAA through DoH and rejects the address
        if ANY answer is in a private, loopback, link-local, multicast or
        documentation range.

   Known gap, accepted: DNS rebinding between this check and the fetch. Workers
   `fetch` can only reach the public internet, not Cloudflare's or any private
   network, so a rebind to a private address has nowhere to go. This check is
   defence in depth, not the only wall.
   ========================================================================== */

const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.arpa', '.lan', '.home', '.corp', '.intranet'];
const BLOCKED_HOSTS = new Set(['localhost']);

/** @returns {{ok:true,url:string,host:string}|{ok:false,reason:'invalid'|'blocked'}} */
export function normalizeInput(raw) {
    if (typeof raw !== 'string') return { ok: false, reason: 'invalid' };
    let s = raw.trim();
    if (!s || s.length > 300 || /\s/.test(s)) return { ok: false, reason: 'invalid' };

    // A bare domain gets https. Anything with a scheme must be http or https.
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]*:\d+(\/|$)/.test(s);
    if (hasScheme) {
        const scheme = s.slice(0, s.indexOf(':')).toLowerCase();
        if (scheme !== 'http' && scheme !== 'https') return { ok: false, reason: 'blocked' };
        if (!/^https?:\/\//i.test(s)) return { ok: false, reason: 'blocked' };
    } else {
        s = 'https://' + s.replace(/^\/\//, '');
    }

    let u;
    try { u = new URL(s); } catch { return { ok: false, reason: 'invalid' }; }

    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'blocked' };
    if (u.username || u.password) return { ok: false, reason: 'blocked' };
    if (u.port && u.port !== '80' && u.port !== '443') return { ok: false, reason: 'blocked' };

    let host = u.hostname.toLowerCase();
    if (host.endsWith('.')) host = host.slice(0, -1);
    if (!host) return { ok: false, reason: 'invalid' };

    // IP literals of any form (the URL parser has already normalised the odd ones).
    if (host.startsWith('[') || host.includes(':')) return { ok: false, reason: 'blocked' };
    if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: 'blocked' };

    if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: 'blocked' };
    if (BLOCKED_SUFFIXES.some((x) => host.endsWith(x))) return { ok: false, reason: 'blocked' };

    // Real public names have a dot and an alphabetic top-level domain.
    const labels = host.split('.');
    if (labels.length < 2) return { ok: false, reason: 'invalid' };
    if (!/^[a-z]{2,}$|^xn--[a-z0-9-]+$/.test(labels[labels.length - 1])) return { ok: false, reason: 'invalid' };
    if (labels.some((l) => !l || l.length > 63 || !/^[a-z0-9-]+$/.test(l) || l.startsWith('-') || l.endsWith('-'))) {
        // Unicode names arrive punycoded from URL(); anything left is malformed.
        return { ok: false, reason: 'invalid' };
    }

    u.hash = '';
    return { ok: true, url: u.toString(), host };
}

/* ---- IP range tests ---------------------------------------------------- */

function ipv4ToInt(ip) {
    const p = ip.split('.');
    if (p.length !== 4) return null;
    let n = 0;
    for (const part of p) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const v = Number(part);
        if (v > 255) return null;
        n = n * 256 + v;
    }
    return n;
}

// [base, prefix length]
const V4_BLOCKS = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([b, l]) => [ipv4ToInt(b), l]);

export function isPrivateIPv4(ip) {
    const n = ipv4ToInt(ip);
    if (n === null) return true; // unparseable: treat as unsafe
    return V4_BLOCKS.some(([base, len]) => {
        const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
        return ((n & mask) >>> 0) === ((base & mask) >>> 0);
    });
}

/** Parse an IPv6 string into 8 hextets, or null. Handles :: and a dotted v4 tail. */
export function parseIPv6(str) {
    let s = str.trim().toLowerCase();
    if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
    s = s.split('%')[0];
    if (!s.includes(':')) return null;

    let tail = [];
    const lastColon = s.lastIndexOf(':');
    const maybeV4 = s.slice(lastColon + 1);
    if (maybeV4.includes('.')) {
        const n = ipv4ToInt(maybeV4);
        if (n === null) return null;
        tail = [(n >>> 16) & 0xffff, n & 0xffff];
        s = s.slice(0, lastColon + 1) + '0:0';
    }

    const dbl = s.split('::');
    if (dbl.length > 2) return null;
    const toGroups = (part) => (part === '' ? [] : part.split(':'));
    const head = toGroups(dbl[0]);
    const rest = dbl.length === 2 ? toGroups(dbl[1]) : [];
    let groups;
    if (dbl.length === 2) {
        const fill = 8 - head.length - rest.length;
        if (fill < 1) return null;
        groups = [...head, ...Array(fill).fill('0'), ...rest];
    } else {
        groups = head;
    }
    if (groups.length !== 8) return null;
    const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
    if (out.some(Number.isNaN)) return null;
    if (tail.length) { out[6] = tail[0]; out[7] = tail[1]; }
    return out;
}

function v4FromHextets(hi, lo) {
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function isPrivateIPv6(ip) {
    const h = parseIPv6(ip);
    if (!h) return true;
    const allZeroTo = (n) => h.slice(0, n).every((x) => x === 0);
    if (allZeroTo(7) && (h[7] === 0 || h[7] === 1)) return true;                    // :: and ::1
    if ((h[0] & 0xfe00) === 0xfc00) return true;                                      // fc00::/7 unique local
    if ((h[0] & 0xffc0) === 0xfe80) return true;                                      // fe80::/10 link-local
    if ((h[0] & 0xff00) === 0xff00) return true;                                      // ff00::/8 multicast
    if (h[0] === 0x2001 && h[1] === 0x0db8) return true;                              // documentation
    if (allZeroTo(5) && h[5] === 0xffff) return isPrivateIPv4(v4FromHextets(h[6], h[7])); // ::ffff:a.b.c.d mapped
    if (allZeroTo(6)) return true;                                                    // ::a.b.c.d deprecated compatible
    if (h[0] === 0x0064 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0))    // 64:ff9b::/96 NAT64
        return isPrivateIPv4(v4FromHextets(h[6], h[7]));
    if (h[0] === 0x2002) return isPrivateIPv4(v4FromHextets(h[1], h[2]));             // 6to4 embeds a v4
    return false;
}

export function isPrivateAddress(ip) {
    return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/* ---- DNS ---------------------------------------------------------------- */

const DOH = 'https://cloudflare-dns.com/dns-query';

async function dohQuery(host, type, fetchImpl) {
    const res = await fetchImpl(`${DOH}?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error('doh ' + res.status);
    return res.json();
}

/**
 * Resolve a host and decide whether it points anywhere public.
 * @returns {Promise<{ok:true,addrs:string[]}|{ok:false,reason:'dns'|'blocked'}>}
 */
export async function resolvePublic(host, fetchImpl = fetch) {
    let a, aaaa;
    try {
        [a, aaaa] = await Promise.all([dohQuery(host, 'A', fetchImpl), dohQuery(host, 'AAAA', fetchImpl)]);
    } catch {
        return { ok: false, reason: 'dns' };
    }
    const addrs = [];
    for (const r of [a, aaaa]) {
        for (const ans of r?.Answer ?? []) {
            if ((ans.type === 1 || ans.type === 28) && typeof ans.data === 'string') addrs.push(ans.data);
        }
    }
    if (!addrs.length) return { ok: false, reason: 'dns' };
    if (addrs.some(isPrivateAddress)) return { ok: false, reason: 'blocked' };
    return { ok: true, addrs };
}

/** The full gate: shape rules, then DNS. Run on the first URL and on every redirect. */
export async function checkTarget(raw, { fetch: fetchImpl = fetch } = {}) {
    const n = normalizeInput(raw);
    if (!n.ok) return n;
    const dns = await resolvePublic(n.host, fetchImpl);
    if (!dns.ok) return dns;
    return { ok: true, url: n.url, host: n.host };
}
