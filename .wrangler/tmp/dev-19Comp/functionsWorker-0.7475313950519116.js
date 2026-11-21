var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/pages-XK524j/functionsWorker-0.7475313950519116.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var HOUR_LIMIT = 5;
var DAY_LIMIT = 20;
var HOUR_TTL = 2 * 3600;
var DAY_TTL = 26 * 3600;
var CACHE_TTL = 3600;
var REPORT_TTL = 30 * 24 * 3600;
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
__name2(sha256Hex, "sha256Hex");
async function ipHash(ip, salt) {
  return (await sha256Hex(String(ip || "unknown") + String(salt || ""))).slice(0, 16);
}
__name(ipHash, "ipHash");
__name2(ipHash, "ipHash");
var pad = /* @__PURE__ */ __name2((n) => String(n).padStart(2, "0"), "pad");
function hourStamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
}
__name(hourStamp, "hourStamp");
__name2(hourStamp, "hourStamp");
function dayStamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
__name(dayStamp, "dayStamp");
__name2(dayStamp, "dayStamp");
async function readCount(kv, key) {
  const v = await kv.get(key);
  const n = Number.parseInt(v ?? "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
__name(readCount, "readCount");
__name2(readCount, "readCount");
async function checkRateLimit({ kv, ip, salt, now = /* @__PURE__ */ new Date() }) {
  const hash = await ipHash(ip, salt);
  const hourKey = `rl:${hash}:${hourStamp(now)}`;
  const dayKey = `rl:${hash}:${dayStamp(now)}`;
  const [hour, day] = await Promise.all([readCount(kv, hourKey), readCount(kv, dayKey)]);
  if (day >= DAY_LIMIT) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return { ok: false, hash, retryAt: next.toISOString(), scope: "day" };
  }
  if (hour >= HOUR_LIMIT) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1));
    return { ok: false, hash, retryAt: next.toISOString(), scope: "hour" };
  }
  await Promise.all([
    kv.put(hourKey, String(hour + 1), { expirationTtl: HOUR_TTL }),
    kv.put(dayKey, String(day + 1), { expirationTtl: DAY_TTL })
  ]);
  return { ok: true, hash };
}
__name(checkRateLimit, "checkRateLimit");
__name2(checkRateLimit, "checkRateLimit");
async function getCachedReport(kv, host) {
  try {
    const v = await kv.get(`cache:${host}`);
    if (!v) return null;
    const r = JSON.parse(v);
    return r && typeof r === "object" && typeof r.reportId === "string" ? r : null;
  } catch {
    return null;
  }
}
__name(getCachedReport, "getCachedReport");
__name2(getCachedReport, "getCachedReport");
async function storeReport(kv, host, report, { cache = true } = {}) {
  const json2 = JSON.stringify(report);
  const writes = [kv.put(`report:${report.reportId}`, json2, { expirationTtl: REPORT_TTL })];
  if (cache) writes.push(kv.put(`cache:${host}`, json2, { expirationTtl: CACHE_TTL }));
  await Promise.all(writes);
}
__name(storeReport, "storeReport");
__name2(storeReport, "storeReport");
var REPORT_ID = /^[A-Za-z0-9]{12}$/;
async function loadReport(kv, id) {
  if (typeof id !== "string" || !REPORT_ID.test(id)) return null;
  try {
    const v = await kv.get(`report:${id}`);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
__name(loadReport, "loadReport");
__name2(loadReport, "loadReport");
var BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function newReportId(len = 12) {
  let out = "";
  while (out.length < len) {
    const bytes = crypto.getRandomValues(new Uint8Array(len * 2));
    for (const b of bytes) {
      if (b < 248 && out.length < len) out += BASE62[b % 62];
    }
  }
  return out;
}
__name(newReportId, "newReportId");
__name2(newReportId, "newReportId");
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }
  });
}
__name(json, "json");
__name2(json, "json");
function methodNotAllowed(allow = "POST") {
  return json({ ok: false, message: "Method not allowed" }, 405, { allow });
}
__name(methodNotAllowed, "methodNotAllowed");
__name2(methodNotAllowed, "methodNotAllowed");
async function readJsonBody(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) return { ok: false, error: "too-large" };
  const reader = request.body?.getReader?.();
  if (!reader) return { ok: false, error: "malformed" };
  const chunks = [];
  let total = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {
        });
        return { ok: false, error: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "malformed" };
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buf));
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "malformed" };
  return { ok: true, data };
}
__name(readJsonBody, "readJsonBody");
__name2(readJsonBody, "readJsonBody");
function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || "";
}
__name(clientIp, "clientIp");
__name2(clientIp, "clientIp");
function truncate(value, n = 200) {
  return String(value && value.message ? value.message : value).slice(0, n);
}
__name(truncate, "truncate");
__name2(truncate, "truncate");
var HEADERS = { "x-robots-tag": "noindex" };
async function onRequestGet(context) {
  const env = context.env || {};
  const id = context.params?.id;
  if (typeof id !== "string" || !REPORT_ID.test(id)) {
    return json({ ok: false, message: "Report not found." }, 404, HEADERS);
  }
  if (!env.AUDITS) {
    console.error("check: missing bindings: AUDITS");
    return json({ ok: false, message: "Something broke on my side. Try again in a minute." }, 500, HEADERS);
  }
  const report = await loadReport(env.AUDITS, id);
  if (!report) return json({ ok: false, message: "Report not found." }, 404, HEADERS);
  return json(report, 200, HEADERS);
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
function onRequest() {
  return methodNotAllowed("GET");
}
__name(onRequest, "onRequest");
__name2(onRequest, "onRequest");
var BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".arpa", ".lan", ".home", ".corp", ".intranet"];
var BLOCKED_HOSTS = /* @__PURE__ */ new Set(["localhost"]);
function normalizeInput(raw) {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  let s = raw.trim();
  if (!s || s.length > 300 || /\s/.test(s)) return { ok: false, reason: "invalid" };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]*:\d+(\/|$)/.test(s);
  if (hasScheme) {
    const scheme = s.slice(0, s.indexOf(":")).toLowerCase();
    if (scheme !== "http" && scheme !== "https") return { ok: false, reason: "blocked" };
    if (!/^https?:\/\//i.test(s)) return { ok: false, reason: "blocked" };
  } else {
    s = "https://" + s.replace(/^\/\//, "");
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "blocked" };
  if (u.username || u.password) return { ok: false, reason: "blocked" };
  if (u.port && u.port !== "80" && u.port !== "443") return { ok: false, reason: "blocked" };
  let host = u.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) return { ok: false, reason: "invalid" };
  if (host.startsWith("[") || host.includes(":")) return { ok: false, reason: "blocked" };
  if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "blocked" };
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: "blocked" };
  if (BLOCKED_SUFFIXES.some((x) => host.endsWith(x))) return { ok: false, reason: "blocked" };
  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, reason: "invalid" };
  if (!/^[a-z]{2,}$|^xn--[a-z0-9-]+$/.test(labels[labels.length - 1])) return { ok: false, reason: "invalid" };
  if (labels.some((l) => !l || l.length > 63 || !/^[a-z0-9-]+$/.test(l) || l.startsWith("-") || l.endsWith("-"))) {
    return { ok: false, reason: "invalid" };
  }
  u.hash = "";
  return { ok: true, url: u.toString(), host };
}
__name(normalizeInput, "normalizeInput");
__name2(normalizeInput, "normalizeInput");
function ipv4ToInt(ip) {
  const p = ip.split(".");
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
__name(ipv4ToInt, "ipv4ToInt");
__name2(ipv4ToInt, "ipv4ToInt");
var V4_BLOCKS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
].map(([b, l]) => [ipv4ToInt(b), l]);
function isPrivateIPv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  return V4_BLOCKS.some(([base, len]) => {
    const mask = len === 0 ? 0 : 4294967295 << 32 - len >>> 0;
    return (n & mask) >>> 0 === (base & mask) >>> 0;
  });
}
__name(isPrivateIPv4, "isPrivateIPv4");
__name2(isPrivateIPv4, "isPrivateIPv4");
function parseIPv6(str) {
  let s = str.trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  s = s.split("%")[0];
  if (!s.includes(":")) return null;
  let tail = [];
  const lastColon = s.lastIndexOf(":");
  const maybeV4 = s.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const n = ipv4ToInt(maybeV4);
    if (n === null) return null;
    tail = [n >>> 16 & 65535, n & 65535];
    s = s.slice(0, lastColon + 1) + "0:0";
  }
  const dbl = s.split("::");
  if (dbl.length > 2) return null;
  const toGroups = /* @__PURE__ */ __name2((part) => part === "" ? [] : part.split(":"), "toGroups");
  const head = toGroups(dbl[0]);
  const rest = dbl.length === 2 ? toGroups(dbl[1]) : [];
  let groups;
  if (dbl.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill("0"), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out = groups.map((g) => /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN);
  if (out.some(Number.isNaN)) return null;
  if (tail.length) {
    out[6] = tail[0];
    out[7] = tail[1];
  }
  return out;
}
__name(parseIPv6, "parseIPv6");
__name2(parseIPv6, "parseIPv6");
function v4FromHextets(hi, lo) {
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}
__name(v4FromHextets, "v4FromHextets");
__name2(v4FromHextets, "v4FromHextets");
function isPrivateIPv6(ip) {
  const h = parseIPv6(ip);
  if (!h) return true;
  const allZeroTo = /* @__PURE__ */ __name2((n) => h.slice(0, n).every((x) => x === 0), "allZeroTo");
  if (allZeroTo(7) && (h[7] === 0 || h[7] === 1)) return true;
  if ((h[0] & 65024) === 64512) return true;
  if ((h[0] & 65472) === 65152) return true;
  if ((h[0] & 65280) === 65280) return true;
  if (h[0] === 8193 && h[1] === 3512) return true;
  if (allZeroTo(5) && h[5] === 65535) return isPrivateIPv4(v4FromHextets(h[6], h[7]));
  if (allZeroTo(6)) return true;
  if (h[0] === 100 && h[1] === 65435 && h.slice(2, 6).every((x) => x === 0))
    return isPrivateIPv4(v4FromHextets(h[6], h[7]));
  if (h[0] === 8194) return isPrivateIPv4(v4FromHextets(h[1], h[2]));
  return false;
}
__name(isPrivateIPv6, "isPrivateIPv6");
__name2(isPrivateIPv6, "isPrivateIPv6");
function isPrivateAddress(ip) {
  return ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}
__name(isPrivateAddress, "isPrivateAddress");
__name2(isPrivateAddress, "isPrivateAddress");
var DOH = "https://cloudflare-dns.com/dns-query";
async function dohQuery(host, type, fetchImpl) {
  const res = await fetchImpl(`${DOH}?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(3e3)
  });
  if (!res.ok) throw new Error("doh " + res.status);
  return res.json();
}
__name(dohQuery, "dohQuery");
__name2(dohQuery, "dohQuery");
async function resolvePublic(host, fetchImpl = fetch) {
  let a, aaaa;
  try {
    [a, aaaa] = await Promise.all([dohQuery(host, "A", fetchImpl), dohQuery(host, "AAAA", fetchImpl)]);
  } catch {
    return { ok: false, reason: "dns" };
  }
  const addrs = [];
  for (const r of [a, aaaa]) {
    for (const ans of r?.Answer ?? []) {
      if ((ans.type === 1 || ans.type === 28) && typeof ans.data === "string") addrs.push(ans.data);
    }
  }
  if (!addrs.length) return { ok: false, reason: "dns" };
  if (addrs.some(isPrivateAddress)) return { ok: false, reason: "blocked" };
  return { ok: true, addrs };
}
__name(resolvePublic, "resolvePublic");
__name2(resolvePublic, "resolvePublic");
async function checkTarget(raw, { fetch: fetchImpl = fetch } = {}) {
  const n = normalizeInput(raw);
  if (!n.ok) return n;
  const dns = await resolvePublic(n.host, fetchImpl);
  if (!dns.ok) return dns;
  return { ok: true, url: n.url, host: n.host };
}
__name(checkTarget, "checkTarget");
__name2(checkTarget, "checkTarget");
var UA = "WilliamMcIlleron-SiteCheck/1.0 (+https://williammcilleron.com/#audit)";
var MAX_BYTES = 1.5 * 1024 * 1024;
var MAX_REDIRECTS = 3;
var PER_REQUEST_MS = 8e3;
var TOTAL_MS = 15e3;
var REDIRECT_STATUS = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
function isTimeout(e) {
  return e && (e.name === "TimeoutError" || e.name === "AbortError");
}
__name(isTimeout, "isTimeout");
__name2(isTimeout, "isTimeout");
async function readCapped(res) {
  const reader = res.body?.getReader?.();
  if (!reader) return { text: await res.text(), bytes: 0, truncated: false };
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let text = "";
  let bytes = 0;
  let truncated = false;
  let timedOut = false;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        const keep = value.byteLength - (bytes - MAX_BYTES);
        text += decoder.decode(value.subarray(0, Math.max(0, keep)), { stream: true });
        bytes = MAX_BYTES;
        truncated = true;
        await reader.cancel().catch(() => {
        });
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (e) {
    timedOut = true;
    await reader.cancel().catch(() => {
    });
  }
  return { text, bytes, truncated, timedOut };
}
__name(readCapped, "readCapped");
__name2(readCapped, "readCapped");
async function fetchPage(input, deps = {}) {
  const f = deps.fetch ?? fetch;
  const guard = deps.guard ?? ((u) => checkTarget(u, { fetch: f }));
  const now = deps.now ?? (() => Date.now());
  const perRequestMs = deps.perRequestMs ?? PER_REQUEST_MS;
  const totalMs = deps.totalMs ?? TOTAL_MS;
  const t0 = now();
  let url = input;
  const hops = [];
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const g = await guard(url);
    if (!g.ok) return { ok: false, reason: g.reason, host: safeHost(url) };
    url = g.url;
    const remaining = totalMs - (now() - t0);
    if (remaining <= 0) return { ok: false, reason: "timeout", host: g.host };
    let res;
    try {
      res = await f(url, {
        method: "GET",
        redirect: "manual",
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": UA },
        signal: AbortSignal.timeout(Math.min(perRequestMs, remaining))
      });
    } catch (e) {
      return { ok: false, reason: isTimeout(e) ? "timeout" : "unreachable", host: g.host };
    }
    if (REDIRECT_STATUS.has(res.status)) {
      const loc = res.headers.get("location");
      await res.body?.cancel?.().catch?.(() => {
      });
      if (!loc) return { ok: false, reason: "http", status: res.status, host: g.host };
      if (i === MAX_REDIRECTS) return { ok: false, reason: "redirects", host: g.host };
      hops.push(url);
      try {
        url = new URL(loc, url).toString();
      } catch {
        return { ok: false, reason: "invalid", host: g.host };
      }
      continue;
    }
    const challenged = res.headers.get("cf-mitigated") === "challenge";
    if (challenged || res.status === 403 || res.status === 429 || res.status === 503) {
      await res.body?.cancel?.().catch?.(() => {
      });
      return { ok: false, reason: "blocked-by-site", status: res.status, host: g.host };
    }
    if (res.status >= 400) {
      await res.body?.cancel?.().catch?.(() => {
      });
      return { ok: false, reason: "http", status: res.status, host: g.host };
    }
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      await res.body?.cancel?.().catch?.(() => {
      });
      return { ok: false, reason: "not-html", type: type.split(";")[0] || "unknown", host: g.host };
    }
    const body = await readCapped(res);
    if (!body.text && body.timedOut) return { ok: false, reason: "timeout", host: g.host };
    return {
      ok: true,
      host: g.host,
      finalUrl: url,
      status: res.status,
      headers: { "content-type": type, "strict-transport-security": res.headers.get("strict-transport-security") || "" },
      html: body.text,
      bytes: body.bytes,
      truncated: body.truncated,
      partial: !!body.timedOut,
      hops
    };
  }
  return { ok: false, reason: "redirects" };
}
__name(fetchPage, "fetchPage");
__name2(fetchPage, "fetchPage");
async function httpRedirectsToHttps(host, deps = {}) {
  const f = deps.fetch ?? fetch;
  const guard = deps.guard ?? ((u) => checkTarget(u, { fetch: f }));
  const url = `http://${host}/`;
  const g = await guard(url);
  if (!g.ok) return null;
  try {
    const res = await f(g.url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "text/html", "user-agent": UA },
      signal: AbortSignal.timeout(5e3)
    });
    await res.body?.cancel?.().catch?.(() => {
    });
    const loc = res.headers.get("location") || "";
    return (res.status === 301 || res.status === 308 || res.status === 302 || res.status === 307) && /^https:\/\//i.test(loc);
  } catch {
    return null;
  }
}
__name(httpRedirectsToHttps, "httpRedirectsToHttps");
__name2(httpRedirectsToHttps, "httpRedirectsToHttps");
function safeHost(u) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(u) ? u : "https://" + u).hostname;
  } catch {
    return "";
  }
}
__name(safeHost, "safeHost");
__name2(safeHost, "safeHost");
var MAX_SCAN = 1.5 * 1024 * 1024;
function visibleText(html) {
  let s = html.length > MAX_SCAN ? html.slice(0, MAX_SCAN) : html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]*>/g, " ");
  s = s.replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&copy;|&#169;/gi, "\xA9").replace(/&lt;|&gt;|&quot;|&#39;|&apos;/gi, " ");
  return s.replace(/\s+/g, " ").trim();
}
__name(visibleText, "visibleText");
__name2(visibleText, "visibleText");
function tags(html, name) {
  const out = [];
  const re = new RegExp("<" + name + "\\b([^>]*)>", "gi");
  let m;
  while (m = re.exec(html)) out.push(attrs(m[1]));
  return out;
}
__name(tags, "tags");
__name2(tags, "tags");
function attrs(src) {
  const o = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while (m = re.exec(src)) o[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return o;
}
__name(attrs, "attrs");
__name2(attrs, "attrs");
function cap(str, n) {
  const s = String(str ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s;
}
__name(cap, "cap");
__name2(cap, "cap");
var PHONE = /(\+27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}/;
var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
var BOOKING = /(calendly|setmore|booksy|fresha|dineplan|simplybook|opentable|resos\.com|acuityscheduling|book\s*now|book\s*online|book\s*an?\s*appointment|make\s*a\s*booking|book\s*a\s*table|reserve\s*a\s*table|request\s*a\s*quote|get\s*a\s*quote)/i;
function checkViewport(html) {
  const m = tags(html, "meta").find((t) => (t.name || "").toLowerCase() === "viewport");
  return { id: "phone_fit", pass: !!m && /width\s*=\s*device-width/i.test(m.content || "") };
}
__name(checkViewport, "checkViewport");
__name2(checkViewport, "checkViewport");
function checkOneTap(html) {
  const links = tags(html, "a").map((t) => t.href || "");
  const hit = links.some((h) => /^tel:/i.test(h) || /wa\.me\//i.test(h) || /api\.whatsapp\.com/i.test(h) || /^whatsapp:\/\//i.test(h));
  return { id: "one_tap", pass: hit };
}
__name(checkOneTap, "checkOneTap");
__name2(checkOneTap, "checkOneTap");
function checkContactDetails(html, text) {
  const mailto = tags(html, "a").some((t) => /^mailto:/i.test(t.href || ""));
  return { id: "contact_details", pass: PHONE.test(text) || EMAIL.test(text) || mailto };
}
__name(checkContactDetails, "checkContactDetails");
__name2(checkContactDetails, "checkContactDetails");
function checkBooking(html, text) {
  const hrefs = tags(html, "a").map((t) => t.href || "").concat(tags(html, "iframe").map((t) => t.src || ""));
  const hasHref = hrefs.some((h) => BOOKING.test(h));
  const formWithInput = /<form\b[\s\S]*?<\/form\s*>/gi;
  let hasForm = false;
  let m;
  while (m = formWithInput.exec(html)) {
    const inputs = tags(m[0], "input");
    if (inputs.some((i) => ["", "text", "email", "tel"].includes((i.type || "").toLowerCase())) || /<textarea\b/i.test(m[0])) {
      hasForm = true;
      break;
    }
  }
  return { id: "booking", pass: hasHref || hasForm || BOOKING.test(text) };
}
__name(checkBooking, "checkBooking");
__name2(checkBooking, "checkBooking");
function checkSearchText(html) {
  const t = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const title = cap(t ? visibleText(t[1]) : "", 70);
  const desc = tags(html, "meta").find((x) => (x.name || "").toLowerCase() === "description");
  const hasDesc = !!desc && (desc.content || "").trim().length > 0;
  return { id: "search_text", pass: !!title && hasDesc, title, hasTitle: !!title, hasDescription: hasDesc };
}
__name(checkSearchText, "checkSearchText");
__name2(checkSearchText, "checkSearchText");
function collectTypes(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectTypes(n, out));
    return;
  }
  const t = node["@type"];
  if (typeof t === "string") out.push(t);
  else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.push(x));
  if (node["@graph"]) collectTypes(node["@graph"], out);
}
__name(collectTypes, "collectTypes");
__name2(collectTypes, "collectTypes");
function checkBusinessDetails(html) {
  const types = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while (m = re.exec(html)) {
    if (!/application\/ld\+json/i.test(attrs(m[1]).type || "")) continue;
    try {
      collectTypes(JSON.parse(m[2]), types);
    } catch {
    }
  }
  return { id: "business_details", pass: types.length > 0, type: cap(types[0] || "", 40) };
}
__name(checkBusinessDetails, "checkBusinessDetails");
__name2(checkBusinessDetails, "checkBusinessDetails");
function checkTracking(html) {
  const found = [];
  if (/fbq\s*\(|connect\.facebook\.net\/[^"']*fbevents\.js|fbevents\.js/i.test(html)) found.push("Meta pixel");
  if (/gtag\s*\(|googletagmanager\.com\/gtag\/js|google-analytics\.com\/analytics\.js/i.test(html)) found.push("Google tag");
  if (/AW-\d{6,}|googleadservices\.com/i.test(html)) found.push("Google Ads");
  const gtm = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i.test(html);
  return {
    id: "tracking",
    pass: found.length > 0 ? true : gtm ? null : false,
    // null: Tag Manager only, cannot see what it loads
    found,
    gtmOnly: found.length === 0 && gtm
  };
}
__name(checkTracking, "checkTracking");
__name2(checkTracking, "checkTracking");
function checkCurrent(text, thisYear) {
  let max = 0;
  const re = /(?:©|copyright|&copy;)\s*(?:\(c\)\s*)?(?:20\d{2}\s*[-–]\s*)?(20\d{2})/gi;
  let m;
  while (m = re.exec(text)) max = Math.max(max, Number(m[1]));
  const stale = max > 0 && thisYear - max >= 2;
  return { id: "current", pass: !stale, year: max || null };
}
__name(checkCurrent, "checkCurrent");
__name2(checkCurrent, "checkCurrent");
function checkSize(html, bytes) {
  const scripts = tags(html, "script").filter((t) => t.src).length;
  const b = bytes || new TextEncoder().encode(html).length;
  return { id: "size", kb: Math.round(b / 1024), scripts, large: b > 500 * 1024 };
}
__name(checkSize, "checkSize");
__name2(checkSize, "checkSize");
function runChecks({ html, finalUrl, httpRedirects = null, bytes, year = (/* @__PURE__ */ new Date()).getFullYear() }) {
  const text = visibleText(html);
  const secureFinal = /^https:/i.test(finalUrl);
  const facts = [
    { id: "secure", pass: secureFinal && httpRedirects !== false },
    checkViewport(html),
    checkOneTap(html),
    checkContactDetails(html, text),
    checkBooking(html, text),
    checkSearchText(html),
    checkBusinessDetails(html),
    checkTracking(html),
    checkCurrent(text, year),
    checkSize(html, bytes)
  ];
  const scripts = facts.find((f) => f.id === "size").scripts;
  const jsHeavy = text.length < 200 && scripts > 10;
  return { facts, jsHeavy };
}
__name(runChecks, "runChecks");
__name2(runChecks, "runChecks");
var ORDER = [
  "secure",
  "phone_fit",
  "one_tap",
  "contact_details",
  "booking",
  "search_text",
  "business_details",
  "tracking",
  "current",
  "speed"
];
var COPY = {
  secure: {
    pass: /* @__PURE__ */ __name2(() => "Your site opens on a secure (https) address.", "pass"),
    fail: /* @__PURE__ */ __name2(() => "Browsers show 'Not secure' next to your address before a customer sees the page.", "fail")
  },
  phone_fit: {
    pass: /* @__PURE__ */ __name2(() => "Your page is set up to fit a phone screen.", "pass"),
    fail: /* @__PURE__ */ __name2(() => "On a phone your page loads at desktop size, so people have to pinch and zoom.", "fail")
  },
  one_tap: {
    pass: /* @__PURE__ */ __name2(() => "A phone visitor can call or WhatsApp you in one tap.", "pass"),
    fail: /* @__PURE__ */ __name2(() => "A phone visitor has to copy your number out of the page to call you.", "fail")
  },
  contact_details: {
    pass: /* @__PURE__ */ __name2(() => "Your phone number or email is on the home page.", "pass"),
    fail: /* @__PURE__ */ __name2(() => "Your home page doesn't show a phone number or email.", "fail")
  },
  booking: {
    pass: /* @__PURE__ */ __name2(() => "There's a way to book or enquire on the page.", "pass"),
    fail: /* @__PURE__ */ __name2(() => "Someone who finds you after hours can't book or leave an enquiry from your home page.", "fail")
  },
  search_text: {
    pass: /* @__PURE__ */ __name2((f) => `Google shows your page as: "${f.title}".`, "pass"),
    fail: /* @__PURE__ */ __name2(() => "Google has to guess the text under your name in search results.", "fail")
  },
  business_details: {
    pass: /* @__PURE__ */ __name2((f) => `Your page tells Google it's a ${f.type}.`, "pass"),
    fail: /* @__PURE__ */ __name2(() => "Your page doesn't tell Google, in its own format, what kind of business you are or where.", "fail")
  },
  tracking: {
    pass: /* @__PURE__ */ __name2((f) => `Ad tracking found: ${f.found.join(", ")}.`, "pass"),
    fail: /* @__PURE__ */ __name2(() => "No ad tracking found in your page's code, so if you run ads you can't tell which one brought a customer.", "fail")
  },
  current: {
    pass: /* @__PURE__ */ __name2(() => "", "pass"),
    fail: /* @__PURE__ */ __name2((f) => `Your footer says \xA9 ${f.year}, which can make a business look closed.`, "fail")
  },
  speed: {
    pass: /* @__PURE__ */ __name2((f) => `Google's phone test: the main content appeared after ${f.lcp} s. One test run; it varies run to run.`, "pass"),
    fail: /* @__PURE__ */ __name2((f) => `Google's phone test: the main content appeared after ${f.lcp} s. One test run; it varies run to run.`, "fail")
  }
};
var CANT_SEE = "Whether you're running ads, your Google listing and reviews, your social pages, and how the site looks. I check those by hand.";
function formatChecked(iso) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric" }).format(d).replace(/\./g, "");
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date}, ${time} (Johannesburg)`;
}
__name(formatChecked, "formatChecked");
__name2(formatChecked, "formatChecked");
function buildReport({ host, facts, jsHeavy, truncated = false, partial = false, speed, checkedAt }) {
  const all = facts.filter((f) => f.id !== "size");
  if (speed && typeof speed.lcp === "number") {
    all.push({ id: "speed", pass: speed.lcp <= 2.5, lcp: speed.lcp.toFixed(1) });
  }
  const working = [];
  const worth = [];
  const unclear = [];
  for (const id of ORDER) {
    const f = all.find((x) => x.id === id);
    if (!f) continue;
    const copy = COPY[id];
    if (f.pass === null) {
      if (id === "tracking") {
        unclear.push({
          id,
          text: "Google Tag Manager is installed. What it loads can't be seen from outside, so I can't say which ads are tracked."
        });
      }
      continue;
    }
    if (f.pass) {
      const text = copy.pass(f);
      if (text) working.push({ id, text });
    } else {
      worth.push({ id, text: copy.fail(f) });
    }
  }
  const size = facts.find((f) => f.id === "size");
  const notes = [];
  if (size) {
    const line = `Your home page's HTML is ${size.kb} KB before images, with ${size.scripts} script${size.scripts === 1 ? "" : "s"}.`;
    if (size.large) worth.push({ id: "size", text: line });
    else notes.push(line);
  }
  if (jsHeavy) notes.push("Your site builds most of the page with JavaScript, so some of these checks may miss things that are there.");
  if (truncated) notes.push("Your home page is very large, so only the first 1.5 MB was read.");
  if (partial) notes.push("Your page stopped arriving part-way, so these checks cover what was received.");
  if (speed === null) notes.push("Google's speed test didn't answer in time, so speed isn't in this report.");
  return {
    host,
    checkedAt,
    checkedLabel: formatChecked(checkedAt),
    working,
    worth,
    unclear,
    notes,
    cantSee: CANT_SEE
  };
}
__name(buildReport, "buildReport");
__name2(buildReport, "buildReport");
function summarise(report) {
  return {
    host: report.host,
    checkedAt: report.checkedAt,
    working: report.working.map((x) => x.id),
    worth: report.worth.map((x) => x.id),
    unclear: report.unclear.map((x) => x.id)
  };
}
__name(summarise, "summarise");
__name2(summarise, "summarise");
var SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
var MAX_TOKEN = 2048;
async function verifyTurnstile({ secret, token, ip, fetch: fetchImpl }) {
  if (!secret) return { ok: false, codes: ["missing-secret"] };
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN) {
    return { ok: false, codes: ["missing-input-response"] };
  }
  const f = fetchImpl ?? globalThis.fetch;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await f(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(5e3) });
    if (!res.ok) return { ok: false, codes: ["http-" + res.status] };
    const data = await res.json();
    if (data && data.success === true) return { ok: true, codes: [] };
    const codes = Array.isArray(data?.["error-codes"]) ? data["error-codes"].map(String).slice(0, 5) : [];
    return { ok: false, codes: codes.length ? codes : ["not-success"] };
  } catch (e) {
    return { ok: false, codes: ["network-error"] };
  }
}
__name(verifyTurnstile, "verifyTurnstile");
__name2(verifyTurnstile, "verifyTurnstile");
var PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
var PSI_TIMEOUT_MS = 22e3;
async function fetchLcp(url, { key, fetch: fetchImpl, timeoutMs = PSI_TIMEOUT_MS } = {}) {
  if (!key || !url) return null;
  const f = fetchImpl ?? globalThis.fetch;
  const q = new URLSearchParams({ url, strategy: "mobile", category: "performance", key });
  try {
    const res = await f(`${PSI_ENDPOINT}?${q}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      await res.body?.cancel?.().catch?.(() => {
      });
      return null;
    }
    const data = await res.json();
    const ms = data?.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
    return Math.round(ms / 100) / 10;
  } catch {
    return null;
  }
}
__name(fetchLcp, "fetchLcp");
__name2(fetchLcp, "fetchLcp");
var STEPS = {
  open: "Opening your page",
  phone: "Reading it like a phone",
  buttons: "Looking for call, WhatsApp and booking buttons",
  google: "Checking what Google can read",
  speed: "Asking Google how fast it loads (up to 20 s)"
};
function hhmm(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}
__name(hhmm, "hhmm");
__name2(hhmm, "hhmm");
function describeType(type) {
  const t = String(type || "").toLowerCase().replace(/[^a-z0-9.+/-]/g, "").slice(0, 60);
  if (t === "application/pdf") return "PDF";
  if (t.startsWith("image/")) return "picture";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "sound file";
  if (t === "application/json") return "data file";
  if (t === "text/plain") return "plain text file";
  if (t === "application/zip") return "zip file";
  return t ? t + " file" : "file of an unknown type";
}
__name(describeType, "describeType");
__name2(describeType, "describeType");
function errorMessage(code, d = {}) {
  const host = d.host || "That site";
  switch (code) {
    case "invalid":
      return "That doesn't look like a web address. Try something like yourbusiness.co.za.";
    case "blocked":
      return "I can only check public websites.";
    case "dns":
      return `I couldn't find a website at ${host}. Check the spelling?`;
    case "timeout":
      return `${host} didn't answer within 15 seconds, so there was nothing to check. A customer on a phone would usually give up sooner.`;
    case "http":
      if (d.redirects) return `${host} kept sending the check to another address, so there was no page to check.`;
      return `${host} answered with an error (${d.status}), so there was no page to check.`;
    case "blocked-by-site":
      return `${host} blocks automated checks, so I can't read it from here. I can check it by hand.`;
    case "not-html":
      return `That address isn't a web page (it's a ${describeType(d.type)}).`;
    case "rate":
      if (d.scope === "day") return `That's the limit of 20 checks a day from one connection. Try again after ${hhmm(d.retryAt)}, or send me the address and I'll check it by hand.`;
      return `That's the limit of 5 checks an hour from one connection. Try again after ${hhmm(d.retryAt)}, or send me the address and I'll check it by hand.`;
    case "turnstile":
      return "Couldn't confirm you're not a bot. Refresh the page and try again.";
    default:
      return "Something broke on my side. Try again in a minute, or send me the address.";
  }
}
__name(errorMessage, "errorMessage");
__name2(errorMessage, "errorMessage");
var MAX_BODY = 4096;
var NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex"
};
function errorEvent(code, d = {}) {
  const ev = { type: "error", code, message: errorMessage(code, d), status: typeof d.status === "number" ? d.status : null };
  if (d.retryAt) ev.retryAt = d.retryAt;
  return ev;
}
__name(errorEvent, "errorEvent");
__name2(errorEvent, "errorEvent");
function ndjsonOnce(event, status) {
  return new Response(JSON.stringify(event) + "\n", { status, headers: NDJSON_HEADERS });
}
__name(ndjsonOnce, "ndjsonOnce");
__name2(ndjsonOnce, "ndjsonOnce");
function log(fields) {
  console.log(JSON.stringify({ evt: "audit", ...fields }));
}
__name(log, "log");
__name2(log, "log");
function mapFetchFailure(page, host) {
  switch (page.reason) {
    case "invalid":
      return ["invalid", {}];
    case "blocked":
      return ["blocked", {}];
    case "dns":
    case "unreachable":
      return ["dns", { host }];
    case "timeout":
      return ["timeout", { host }];
    case "redirects":
      return ["http", { host, redirects: true }];
    case "http":
      return ["http", { host, status: page.status }];
    case "blocked-by-site":
      return ["blocked-by-site", { host, status: page.status }];
    case "not-html":
      return ["not-html", { host, type: page.type }];
    default:
      return ["internal", {}];
  }
}
__name(mapFetchFailure, "mapFetchFailure");
__name2(mapFetchFailure, "mapFetchFailure");
async function onRequestPost(context) {
  const { request } = context;
  const env = context.env || {};
  const t0 = Date.now();
  const parsed = await readJsonBody(request, MAX_BODY);
  if (!parsed.ok) {
    return json({ ok: false, error: parsed.error }, parsed.error === "too-large" ? 413 : 400);
  }
  const { url, turnstileToken } = parsed.data;
  if (typeof url !== "string" || !url.trim()) return json({ ok: false, error: "malformed" }, 400);
  const missing = ["AUDITS", "TURNSTILE_SECRET", "RL_SALT"].filter((k) => !env[k]);
  if (missing.length) {
    console.error("audit: missing bindings: " + missing.join(", "));
    return ndjsonOnce(errorEvent("internal"), 500);
  }
  const ip = clientIp(request);
  const ipPrefix = await ipHash(ip, env.RL_SALT);
  const ts = await verifyTurnstile({ secret: env.TURNSTILE_SECRET, token: turnstileToken, ip });
  if (!ts.ok) {
    log({ outcome: "turnstile", ms: Date.now() - t0, ip: ipPrefix, codes: ts.codes });
    return ndjsonOnce(errorEvent("turnstile"), 403);
  }
  let rl;
  try {
    rl = await checkRateLimit({ kv: env.AUDITS, ip, salt: env.RL_SALT });
  } catch (e) {
    console.error("audit: rate limit store failed: " + truncate(e));
    return ndjsonOnce(errorEvent("internal"), 500);
  }
  if (!rl.ok) {
    log({ outcome: "rate", scope: rl.scope, ms: Date.now() - t0, ip: ipPrefix });
    return ndjsonOnce(errorEvent("rate", { retryAt: rl.retryAt, scope: rl.scope }), 429);
  }
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = /* @__PURE__ */ __name2((obj) => writer.write(enc.encode(JSON.stringify(obj) + "\n")).catch(() => {
  }), "send");
  const work = runAudit({ url, env, send, t0, ipPrefix }).catch((e) => {
    console.error("audit: crashed: " + truncate(e));
    log({ outcome: "internal", ms: Date.now() - t0, ip: ipPrefix });
    return send(errorEvent("internal"));
  }).finally(() => writer.close().catch(() => {
  }));
  if (typeof context.waitUntil === "function") context.waitUntil(work);
  return new Response(readable, { status: 200, headers: NDJSON_HEADERS });
}
__name(onRequestPost, "onRequestPost");
__name2(onRequestPost, "onRequestPost");
async function runAudit({ url, env, send, t0, ipPrefix }) {
  const done = /* @__PURE__ */ __name2((outcome, extra = {}) => log({ outcome, ms: Date.now() - t0, ip: ipPrefix, ...extra }), "done");
  const n = normalizeInput(url);
  if (!n.ok) {
    done(n.reason);
    return send(errorEvent(n.reason));
  }
  const host = n.host;
  const typedScheme = /^https?:\/\//i.test(url.trim());
  const u = new URL(n.url);
  const isHome = u.pathname === "/" && !u.search;
  if (isHome) {
    const cached = await getCachedReport(env.AUDITS, host);
    if (cached) {
      done("cached", { host });
      return send({ type: "report", report: cached, shareUrl: "/check/" + cached.reportId, cached: true });
    }
  }
  await send({ type: "step", id: "open", label: STEPS.open });
  const page = await fetchPage(n.url);
  if (!page.ok) {
    const [code, d] = mapFetchFailure(page, host);
    done(code, { host, status: page.status ?? null });
    return send(errorEvent(code, d));
  }
  const httpRedirects = !typedScheme && /^https:/i.test(page.finalUrl) ? await httpRedirectsToHttps(host) : null;
  await send({ type: "step", id: "phone", label: STEPS.phone });
  const { facts, jsHeavy } = runChecks({ html: page.html, finalUrl: page.finalUrl, httpRedirects, bytes: page.bytes });
  page.html = "";
  await send({ type: "step", id: "buttons", label: STEPS.buttons });
  await send({ type: "step", id: "google", label: STEPS.google });
  let speed;
  if (env.PSI_KEY) {
    await send({ type: "step", id: "speed", label: STEPS.speed });
    const lcp = await fetchLcp(page.finalUrl, { key: env.PSI_KEY });
    speed = lcp === null ? null : { lcp };
  }
  const report = {
    ...buildReport({
      host,
      facts,
      jsHeavy,
      truncated: page.truncated,
      partial: page.partial,
      speed,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    }),
    reportId: newReportId()
  };
  let shareUrl = "/check/" + report.reportId;
  try {
    await storeReport(env.AUDITS, host, report, { cache: isHome });
  } catch (e) {
    console.error("audit: report store failed: " + truncate(e));
    shareUrl = null;
  }
  done("ok", {
    host,
    pass: report.working.map((x) => x.id),
    fail: report.worth.map((x) => x.id),
    speed: speed === void 0 ? "off" : speed === null ? "none" : "ok"
  });
  return send({ type: "report", report, shareUrl });
}
__name(runAudit, "runAudit");
__name2(runAudit, "runAudit");
function onRequest2() {
  return methodNotAllowed("POST");
}
__name(onRequest2, "onRequest2");
__name2(onRequest2, "onRequest");
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function(char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}
__name(escapeHtml, "escapeHtml");
__name2(escapeHtml, "escapeHtml");
async function storeThenEmail(env, { form, data, fields, subject, replyTo, extra = {} }) {
  const received = (/* @__PURE__ */ new Date()).toISOString();
  const key = "enquiry:" + received + "-" + crypto.randomUUID().slice(0, 8);
  const record = { received, form, data, ...extra, email: "pending" };
  async function save() {
    if (!env.ENQUIRIES) return;
    try {
      await env.ENQUIRIES.put(key, JSON.stringify(record));
    } catch (error) {
      console.error("KV write failed:", error);
    }
  }
  __name(save, "save");
  __name2(save, "save");
  if (env.ENQUIRIES) {
    await save();
  } else {
    console.warn("ENQUIRIES KV is not bound: enquiry will only be emailed.");
  }
  if (env.RESEND_API_KEY && env.CONTACT_TO) {
    const text = fields.map(function(f) {
      return f.label + ": " + f.value;
    }).join("\n\n");
    const html = '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#15140f"><h2 style="margin:0 0 20px;font-size:18px">New enquiry from your portfolio</h2>' + fields.map(function(f) {
      return '<p style="margin:0 0 16px"><strong style="display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5d5a51">' + escapeHtml(f.label) + "</strong>" + escapeHtml(f.value).replace(/\n/g, "<br>") + "</p>";
    }).join("") + "</div>";
    const body = {
      from: env.CONTACT_FROM || "Portfolio <onboarding@resend.dev>",
      to: [env.CONTACT_TO],
      subject,
      text,
      html
    };
    if (replyTo) body.reply_to = replyTo;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (response.ok) {
        record.email = "sent";
      } else {
        const detail = (await response.text()).slice(0, 300);
        console.error("Resend rejected the message:", response.status, detail);
        record.email = "failed: " + response.status + " " + detail;
      }
    } catch (error) {
      console.error("Resend request failed:", error);
      record.email = "failed: " + String(error && error.message || error).slice(0, 300);
    }
  } else {
    console.warn("RESEND_API_KEY or CONTACT_TO missing: enquiry stored, not emailed.");
    record.email = "skipped: " + (env.RESEND_API_KEY ? "" : "no RESEND_API_KEY ") + (env.CONTACT_TO ? "" : "no CONTACT_TO");
  }
  await save();
  return { key, record };
}
__name(storeThenEmail, "storeThenEmail");
__name2(storeThenEmail, "storeThenEmail");
var MAX_BODY2 = 4096;
var EMAIL2 = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/;
var PHONE2 = /^[+\d\s()-]{6,30}$/;
var LEAD_COPY = {
  malformed: "Something was wrong with that request. Refresh the page and try again.",
  business: "Add your business name.",
  email: "That email address doesn't look right.",
  whatsapp: "That WhatsApp number doesn't look right. Digits only, like 082 123 4567.",
  report: "That report has expired or was never made. Run the check again, then send this form.",
  turnstile: "Couldn't confirm you're not a bot. Refresh the page and try again.",
  internal: "Something broke on my side. Try again in a minute."
};
var fail = /* @__PURE__ */ __name2((key, status) => json({ ok: false, message: LEAD_COPY[key] }, status), "fail");
function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1);
}
__name(clean, "clean");
__name2(clean, "clean");
async function onRequestPost2(context) {
  const { request } = context;
  const env = context.env || {};
  const parsed = await readJsonBody(request, MAX_BODY2);
  if (!parsed.ok) return fail("malformed", parsed.error === "too-large" ? 413 : 400);
  const b = parsed.data;
  const business = clean(b.business, 120);
  const email = clean(b.email, 254);
  const whatsapp = clean(b.whatsapp, 30);
  if (typeof b.reportId !== "string" || !REPORT_ID.test(b.reportId)) return fail("report", 400);
  if (!business || business.length > 120) return fail("business", 400);
  if (!email || email.length > 254 || !EMAIL2.test(email)) return fail("email", 400);
  if (whatsapp && (whatsapp.length > 30 || !PHONE2.test(whatsapp))) return fail("whatsapp", 400);
  const canDeliver = env.ENQUIRIES || env.RESEND_API_KEY && env.CONTACT_TO;
  if (!env.AUDITS || !env.TURNSTILE_SECRET || !canDeliver) {
    const missing = ["AUDITS", "TURNSTILE_SECRET"].filter((k) => !env[k]);
    if (!canDeliver) missing.push("ENQUIRIES or RESEND_API_KEY+CONTACT_TO");
    console.error("audit-lead: missing bindings: " + missing.join(", "));
    return fail("internal", 500);
  }
  const ts = await verifyTurnstile({ secret: env.TURNSTILE_SECRET, token: b.turnstileToken, ip: clientIp(request) });
  if (!ts.ok) {
    console.log(JSON.stringify({ evt: "audit-lead", outcome: "turnstile", codes: ts.codes }));
    return fail("turnstile", 403);
  }
  const report = await loadReport(env.AUDITS, b.reportId);
  if (!report || typeof report.host !== "string" || !Array.isArray(report.working) || !Array.isArray(report.worth)) {
    console.log(JSON.stringify({ evt: "audit-lead", outcome: "no-report" }));
    return fail("report", 404);
  }
  const summary = summarise(report);
  const host = summary.host;
  const data = { business, email };
  if (whatsapp) data.whatsapp = whatsapp;
  const link = new URL("/check/" + b.reportId, request.url).toString();
  const fields = [
    { label: "Business", value: business },
    { label: "Email", value: email },
    ...whatsapp ? [{ label: "WhatsApp", value: whatsapp }] : [],
    { label: "Site", value: host },
    { label: "Report", value: link },
    { label: "Worth fixing", value: summary.worth.join(", ") || "nothing flagged" },
    { label: "Working", value: summary.working.join(", ") || "nothing passed" }
  ];
  try {
    await storeThenEmail(env, {
      form: "audit-lead",
      data,
      fields,
      subject: "Audit lead: " + business + " (" + host + ")",
      replyTo: email,
      extra: { host, reportId: b.reportId, summary }
    });
  } catch (e) {
    console.error("audit-lead: crashed: " + truncate(e));
    return fail("internal", 500);
  }
  console.log(JSON.stringify({ evt: "audit-lead", outcome: "ok", host }));
  return json({ ok: true });
}
__name(onRequestPost2, "onRequestPost2");
__name2(onRequestPost2, "onRequestPost");
function onRequest3() {
  return methodNotAllowed("POST");
}
__name(onRequest3, "onRequest3");
__name2(onRequest3, "onRequest");
var LABELS = {
  name: "Name",
  email: "Email",
  business: "Business",
  area: "Works in",
  town: "Shoots in",
  website: "Current site",
  project: "Project type",
  budget: "Budget",
  message: "Message",
  source: "Came from"
};
var SUBJECTS = {
  "lumen-enquiry": "Photographer enquiry",
  "portfolio-contact-form": "Portfolio enquiry",
  "solar-enquiry": "Solar enquiry",
  "skincare-enquiry": "Skin & beauty enquiry"
};
var MAX_FIELD = 5e3;
function thanks(request) {
  return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
}
__name(thanks, "thanks");
__name2(thanks, "thanks");
async function onRequestPost3(context) {
  const { request, env } = context;
  let form;
  try {
    form = await request.formData();
  } catch (error) {
    return new Response("Bad request", { status: 400 });
  }
  if (String(form.get("company") || "").trim()) return thanks(request);
  const formName = String(form.get("form-name") || "");
  const data = {};
  for (const key of Object.keys(LABELS)) {
    const values = form.getAll(key).map(function(v) {
      return String(v).trim().slice(0, MAX_FIELD);
    }).filter(Boolean);
    if (values.length) data[key] = values.join(", ");
  }
  if (!Object.keys(data).length) return thanks(request);
  const fields = Object.keys(LABELS).filter(function(key) {
    return data[key];
  }).map(function(key) {
    return { label: LABELS[key], value: data[key] };
  });
  const senderName = data.name || "Someone";
  const qualifier = data.business || data.project || data.area || data.town;
  const subject = (SUBJECTS[formName] || "Website enquiry") + " \u2014 " + senderName + (qualifier ? " (" + qualifier + ")" : "");
  await storeThenEmail(env, { form: formName, data, fields, subject, replyTo: data.email });
  return thanks(request);
}
__name(onRequestPost3, "onRequestPost3");
__name2(onRequestPost3, "onRequestPost");
function onRequest4() {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}
__name(onRequest4, "onRequest4");
__name2(onRequest4, "onRequest");
var REPORT_ID2 = /^[A-Za-z0-9]{12}$/;
async function onRequestGet2(context) {
  const id = context.params?.id;
  if (typeof id !== "string" || !REPORT_ID2.test(id)) {
    return new Response("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
  }
  const assets = context.env?.ASSETS;
  if (!assets || typeof assets.fetch !== "function") {
    console.error("check page: missing ASSETS binding");
    return new Response("Something broke on my side. Try again in a minute.", { status: 500, headers: { "x-robots-tag": "noindex" } });
  }
  let res = await assets.fetch(new URL("/check/", context.request.url));
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    res = await assets.fetch(new URL(res.headers.get("location"), context.request.url));
  }
  const headers = new Headers(res.headers);
  if (res.ok && !/text\/html/i.test(headers.get("content-type") || "")) headers.set("content-type", "text/html; charset=utf-8");
  headers.set("x-robots-tag", "noindex");
  headers.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
var routes = [
  {
    routePath: "/api/check/:id",
    mountPath: "/api/check",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/check/:id",
    mountPath: "/api/check",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/audit",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/audit-lead",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/contact",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/audit",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/audit-lead",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/contact",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/check/:id",
    mountPath: "/check",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function getOriginalPathPrefix(requestPath, normalizedPrefix) {
  let end = 0;
  for (let index = 0; index < normalizedPrefix.length; index++) {
    end++;
    if (normalizedPrefix[index] === "/") {
      while (requestPath[end] === "/") {
        end++;
      }
    }
  }
  return requestPath.slice(0, end);
}
__name(getOriginalPathPrefix, "getOriginalPathPrefix");
__name2(getOriginalPathPrefix, "getOriginalPathPrefix");
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  const normalizedRequestPath = requestPath.replace(/\/+/g, "/");
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath) || routeMatcher(normalizedRequestPath);
    const originalMountMatch = mountMatcher(requestPath);
    const mountMatchResult = originalMountMatch || mountMatcher(normalizedRequestPath);
    if (matchResult && mountMatchResult) {
      const path = originalMountMatch ? originalMountMatch.path : getOriginalPathPrefix(requestPath, mountMatchResult.path);
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../../../../../AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../../../../../AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-nDgOGf/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../../../../../AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-nDgOGf/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.7475313950519116.js.map
