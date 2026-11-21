# Booking: notes and setup

Served as a 404 by `_redirects`; this is for the repo, not the site.

Visitors book a 20 minute call at `/book/`. Storage is **Cloudflare D1** (SQLite, strongly consistent). A partial unique index on `bookings(slot_start) WHERE status = 'booked'` is what makes a double booking impossible: the second insert fails and the visitor is told to pick another time. Cancelling frees the slot.

## One-time setup (William does this in the Cloudflare dashboard)

1. **Create the database.** Workers & Pages > **D1 SQL database** > **Create database**. Name it `williammcilleron-bookings`. Location: leave on automatic.
2. **Create the table.** Open the database > **Console** tab. Paste the whole of `migrations/0001_bookings.sql` and press **Execute**. Then run `SELECT name FROM sqlite_master WHERE type = 'table';` and check it lists `bookings`.
3. **Bind it to the site.** Workers & Pages > the `williammcilleron` Pages project > **Settings** > **Bindings** > **Add** > **D1 database**. Variable name must be exactly `DB`. Pick `williammcilleron-bookings`. Add it for **Production** (and **Preview** if you test on preview deploys).
4. **Add the secret.** Same page > **Variables and Secrets** > **Add** > type **Secret**, name `BOOKING_SECRET`, value any long random string. To make one, run in a terminal: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Production only is fine. Keep a copy somewhere safe: changing it later invalidates every emailed cancel link.
5. **Check the email settings that already exist.** `RESEND_API_KEY`, `CONTACT_TO` (where you get notified) and `CONTACT_FROM` are used by the contact form already. For the confirmation to reach visitors, `CONTACT_FROM` must be an address on a domain verified in Resend (for example `William McIlleron <william@williammcilleron.com>`); the `onboarding@resend.dev` fallback only delivers to you. Without these the booking still saves and the visitor still sees the confirmation page, but no emails go out.
6. **Redeploy.** Bindings only apply to a new deployment: Deployments > the latest > **Retry deployment**, or merge the PR.
7. **Test it once for real.** Book a slot from your phone, check the notification email arrived, open the cancel link, cancel, and confirm the slot reappears on `/book/`.

`TURNSTILE_SECRET` is already set from the site check. The booking page uses the same site key (it works on the production hostname only).

## Endpoints

| Route | File | What it does |
|---|---|---|
| `GET /api/book/slots` | `functions/api/book/slots.js` | Open days and times, taken ones removed |
| `POST /api/book` | `functions/api/book.js` | Validates, Turnstile, limits, inserts, emails both sides |
| `GET /api/book/cancel?token=` | `functions/api/book/cancel.js` | Read-only: which call this link is for |
| `POST /api/book/cancel` | same | Cancels it. A POST on purpose: mail scanners and link previews open links with GET and must not cancel a call |

Pages: `/book/` (`book/index.html`, `book.js`, `book.css`) and `/book/cancel/`.

## Changing the hours

Everything is in `functions/_lib/book-config.js`: slot length, notice, how far ahead, term and holiday hours, school-holiday date ranges, blackout days. Times are SAST (UTC+2, no daylight saving). Then run `node --test "tests/*.test.mjs"`.

Items marked `[VERIFY]` in that file are assumptions: the 2028 end of the December 2027 holiday, and the public-holiday blackout list (fixed-date ones only; 2027 movable ones such as Good Friday are not in it).

## Limits and what is stored

- 3 bookings per IP per 24 hours; 2 upcoming calls per email address. Both counted in D1.
- Stored per booking: reference, slot, name, email, phone, how to call, topic, optional business and note, status, an HMAC of the cancel token and an HMAC of the IP (never the token or the IP), timestamps. Logs hold the reference and outcome only, no personal details.
- Cancelled rows are kept (status `cancelled`). To delete personal data on request: `DELETE FROM bookings WHERE email = '...';` in the D1 console.

## Tests

`tests/book-slots.test.mjs` (hours and boundaries) and `tests/book.test.mjs` (endpoints). They run the real migration through Node's built-in SQLite via `tests/_d1.mjs`, so the unique index is the real one, not a mock. Full Cloudflare runtime check: `npx wrangler pages dev . --d1 DB --binding TURNSTILE_SECRET=1x0000000000000000000000000000000AA --binding BOOKING_SECRET=x`, then run the migration against the `.sqlite` file under `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/` (the one that is not `metadata.sqlite`).

## Not built yet

Google Calendar sync (so your own events block slots) and a Google Meet link per booking. Both need a Google service account or OAuth and are a separate decision.
