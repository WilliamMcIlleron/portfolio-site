# Site check: backend notes

Served as a 404 by `_redirects`; this is for the repo, not the site.

## Endpoints

| Route | File | What it does |
|---|---|---|
| `POST /api/audit` | `functions/api/audit.js` | Runs one check, streams NDJSON |
| `POST /api/audit-lead` | `functions/api/audit-lead.js` | "Check the rest by hand" form |
| `GET /api/check/{id}` | `functions/api/check/[id].js` | A stored report, for `/check/{id}` |
| `POST /api/contact` | `functions/api/contact.js` | Unchanged behaviour; now shares `_lib/enquiry.js` |

`GET /check/{id}` is served by `functions/check/[id].js`, which returns the static `/check/` page (a `_redirects` rewrite did not work on Pages and 404ed in production). Helpers live in `functions/_lib/` and export no
`onRequest*`, so they never become routes.

## Bindings and secrets (Pages project > Settings)

| Name | Kind | Needed by | Notes |
|---|---|---|---|
| `AUDITS` | KV namespace | audit, audit-lead, check | New. Rate counters, 1 h host cache, 30-day reports. Keep it separate from enquiries. |
| `TURNSTILE_SECRET` | secret | audit, audit-lead | From the Turnstile widget. |
| `TURNSTILE_SITEKEY` | (front end) | the page | Public; goes in the HTML, not a Function. |
| `RL_SALT` | secret | audit | Any long random string. Salts the hashed IP in rate-limit keys and logs. |
| `PSI_KEY` | secret, optional | audit | Google PageSpeed Insights API key. Without it there is no speed step. |
| `ENQUIRIES` | KV namespace | contact, audit-lead | Existing. |
| `RESEND_API_KEY` | secret | contact, audit-lead | Existing. |
| `CONTACT_TO` | variable | contact, audit-lead | Existing. |
| `CONTACT_FROM` | variable, optional | contact, audit-lead | Existing. |

A missing required binding returns the `internal` error, never a crash.
`audit-lead` also refuses (internal) when neither `ENQUIRIES` nor
`RESEND_API_KEY` + `CONTACT_TO` is set, so a lead always lands somewhere.

## KV keys (`AUDITS`)

| Key | Value | TTL |
|---|---|---|
| `rl:{sha256(ip+RL_SALT)[0..16]}:{yyyymmddhh}` | hour count, limit 5 | 2 h |
| `rl:{sha256(ip+RL_SALT)[0..16]}:{yyyymmdd}` | day count, limit 20 | 26 h |
| `cache:{host}` | report JSON (home page checks only) | 1 h |
| `report:{reportId}` | report JSON | 30 days |

The fetched HTML is never stored. Each fresh check writes 4 keys (2 counters,
report, cache); a cached check writes 2. The free tier allows 1,000 KV writes
a day, so about 250 fresh checks a day.

## `POST /api/audit` contract

Request: `{"url": "yourbusiness.co.za", "turnstileToken": "..."}`, JSON, max 4 KB.

Answer: `application/x-ndjson`, one JSON object per line. Read the body as a
stream and parse line by line.

```
{"type":"step","id":"open","label":"Opening your page"}
{"type":"step","id":"phone","label":"Reading it like a phone"}
{"type":"step","id":"buttons","label":"Looking for call, WhatsApp and booking buttons"}
{"type":"step","id":"google","label":"Checking what Google can read"}
{"type":"step","id":"speed","label":"Asking Google how fast it loads (up to 20 s)"}   (only when PSI_KEY is set)
{"type":"report","report":{...buildReport output..., "reportId":"Ab12Cd34Ef56"},"shareUrl":"/check/Ab12Cd34Ef56"}
```

or, in place of the report, one error line:

```
{"type":"error","code":"invalid|blocked|dns|timeout|http|blocked-by-site|not-html|rate|turnstile|internal","message":"<visitor copy>","status":<n|null>}
```

- Steps are sent when each stage starts. `phone`, `buttons` and `google` are
  in-memory checks, so those three arrive within milliseconds of each other.
- A home page checked in the last hour comes from the cache: no steps, just
  the report line with `"cached": true` and the original `reportId`.
- `shareUrl` is `null` if the report could not be stored; the report still shows.
- A `rate` error also carries `retryAt` (ISO time).
- HTTP status: 200 once the stream starts (errors found during the check come
  as an error line). Errors found before it starts keep the same one-line
  NDJSON body but use a real status: 403 `turnstile`, 429 `rate`, 500
  `internal` (missing binding or KV down). So always parse the body; do not
  branch on `res.ok` alone.
- A malformed body is plain JSON `{"ok":false,"error":"malformed"}` with 400,
  or `"too-large"` with 413. Other methods: 405.

## `POST /api/audit-lead`

Request: `{"business", "email", "whatsapp"?, "reportId", "turnstileToken"}`,
JSON, max 4 KB. Answer: `{"ok":true}` or `{"ok":false,"message":"..."}`
(400 bad field, 403 Turnstile, 404 unknown or expired report, 413 too large,
500 internal). The host and summary come from `report:{reportId}` on the
server; anything else in the body is ignored. The form is validated before
Turnstile, so a typo does not spend the token. Get a fresh Turnstile token for
every submit either way.

## `GET /api/check/{id}`

The stored report JSON, or 404 `{"ok":false,"message":"Report not found."}`.
Always `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

## Local testing

Cloudflare's dummy Turnstile keys:

| | Key | Behaviour |
|---|---|---|
| Site key | `1x00000000000000000000AA` | always passes (visible widget) |
| Secret | `1x0000000000000000000000000000000AA` | always passes |
| Secret | `2x0000000000000000000000000000000AA` | always fails |

For a local run with real bindings (wrangler through npx, nothing installed
in the repo), put the secrets in a `.dev.vars` file (git-ignored) and run:

```
npx wrangler pages dev . --kv AUDITS --kv ENQUIRIES
```

## Tests

```
node --test "tests/*.test.mjs"
```

No network: KV, fetch, Turnstile, DoH, PageSpeed and Resend are all mocked
(`tests/_mocks.mjs`). `tests/contact.test.mjs` pins `/api/contact`'s stored
record and Resend call so the shared `_lib/enquiry.js` stays a pure refactor.
