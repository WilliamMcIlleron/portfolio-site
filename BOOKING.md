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
| `POST /api/book/reminders` | `functions/api/book/reminders.js` | Called every 15 min by the cron Worker (`workers/booking-cron/`). Sends due reminder emails, deletes bookings older than 12 months. Needs the `x-reminder-secret` header |
| `POST /api/book/cancel` | same | Cancels it. A POST on purpose: mail scanners and link previews open links with GET and must not cancel a call |

Pages: `/book/` (`book/index.html`, `book.js`, `book.css`) and `/book/cancel/`.

## Changing the hours

Everything is in `functions/_lib/book-config.js`: slot length, notice, how far ahead, term and holiday hours, school-holiday date ranges, blackout days. Times are SAST (UTC+2, no daylight saving). Then run `node --test "tests/*.test.mjs"`.

Items marked `[VERIFY]` in that file are assumptions: the 2028 end of the December 2027 holiday, and the public-holiday blackout list (fixed-date ones only; 2027 movable ones such as Good Friday are not in it).

## Limits and what is stored

- 3 bookings per IP per 24 hours; 2 upcoming calls per email address. Both counted in D1.
- **Daily cap: 3 calls on a school day** (a term-time Monday to Friday; `SCHOOL_DAY_CAP` in `book-config.js`). Saturdays, school holidays and blackout days have no cap. A full day disappears from `/book/`, and cancelling a call frees a place. The cap is checked inside the INSERT, so simultaneous bookings cannot exceed it.
- Stored per booking: reference, slot, name, email, phone, how to call, topic, optional business and note, status, an HMAC of the cancel token and an HMAC of the IP (never the token or the IP), the Google Calendar event id, when the reminder was sent, timestamps. Logs hold the reference and outcome only, no personal details.
- **Retention: 12 months after the call** (`RETENTION_DAYS`). The reminders job deletes older rows, cancelled ones included. `/book/` tells visitors this, so do not shorten the job without updating the privacy paragraph in `book/index.html`.
- To delete one person's data on request: `DELETE FROM bookings WHERE email = '...';` in the D1 console (and delete their event from Google Calendar by hand).

## Visitor reminders

An email goes to the visitor three hours before the call ("A quick reminder that William McIlleron is calling you today at 15:30..."), but never before 07:00 that morning (`REMINDER_HOURS_BEFORE`, `REMINDER_NOT_BEFORE`). Once only: the send is claimed in the database first, and released if the email fails so the next run retries until the call starts.

Pages Functions cannot run on a schedule, so a tiny Worker, `booking-cron`, has a Cron Trigger every 15 minutes and calls `POST /api/book/reminders` with a shared secret. Setup (done 21 Nov 2026):
1. Migration `0003_reminded_at.sql` on the D1 database.
2. A secret `REMINDER_SECRET` on the Pages project (Settings > Variables and Secrets) and **the same value** as a secret on the Worker.
3. The Worker `booking-cron` (source: `workers/booking-cron/worker.js`) with cron `*/15 * * * *`. Deploy with `npx wrangler deploy` from that folder, or upload it in the dashboard (Workers & Pages > Create > Worker, paste the file, add the secret, then Settings > Triggers > Cron).
4. To rotate the secret, change it in both places at once.

Check it is alive: Workers & Pages > `booking-cron` > Logs shows a line like `booking-cron: {"ok":true,"sent":0,"failed":0,"purged":0}` every 15 minutes. `401` means the two secrets differ; `404` means the site has not deployed the reminders endpoint.

## Tests

`tests/book-slots.test.mjs` (hours and boundaries) and `tests/book.test.mjs` (endpoints). They run the real migration through Node's built-in SQLite via `tests/_d1.mjs`, so the unique index is the real one, not a mock. Full Cloudflare runtime check: `npx wrangler pages dev . --d1 DB --binding TURNSTILE_SECRET=1x0000000000000000000000000000000AA --binding BOOKING_SECRET=x`, then run the migration against the `.sqlite` file under `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/` (the one that is not `metadata.sqlite`).

## Google Calendar sync (optional, off until the two secrets exist)

What it does: a time that clashes with an event on your Google Calendar is never offered, and it is checked again at the moment of booking. Each booking is written to your calendar as an event ("Call: Name", with the phone number, how to call, topics, note and reference, plus a 30 minute pop-up reminder), and cancelling the booking deletes the event. If Google does not answer, bookings carry on as normal and the problem is logged (no personal details in the log).

It uses a **Google service account**: a robot login that never expires. You share your calendar with it, and it can read busy times and add events. Trade-offs: it cannot invite the visitor to the event (they get the Google and Outlook links in their email instead) and it cannot make Google Meet links (that would need OAuth, which on a personal Gmail account expires every 7 days while the app is in testing mode).

### One-time setup

1. **Create a project.** Go to console.cloud.google.com, signed in as the Google account that owns the calendar. Project picker (top bar) > **New project** > name it `williammcilleron-bookings` > **Create**, then select it.
2. **Turn on the Calendar API.** Menu > **APIs & Services** > **Library** > search **Google Calendar API** > **Enable**.
3. **Create the service account.** Menu > **IAM & Admin** > **Service Accounts** > **Create service account**. Name `bookings`. Skip the optional role and user steps > **Done**. Copy its email address (ends `.iam.gserviceaccount.com`).
4. **Make its key.** Click the account > **Keys** tab > **Add key** > **Create new key** > **JSON** > **Create**. A `.json` file downloads. Treat it like a password: anyone with it can edit your calendar. If the option is greyed out, an organisation policy is blocking key creation; tell me.
5. **Share your calendar with it.** calendar.google.com > the gear > **Settings** > under **Settings for my calendars** click your calendar > **Share with specific people or groups** > **Add people and groups** > paste the service account email > permission **Make changes to events** > **Send**. Then on the same page, under **Integrate calendar**, copy the **Calendar ID** (for your main calendar it is your Gmail address).
6. **Give the site the two secrets.** Pages project `williammcilleron` > **Settings** > **Variables and Secrets**, add as **Secrets**: `GOOGLE_CALENDAR_ID` (the Calendar ID) and `GOOGLE_SERVICE_ACCOUNT` (open the downloaded `.json` in Notepad, select all, paste the whole thing). Then **Deployments** > latest > **Retry deployment** so they apply.
7. **Run the migration** `migrations/0002_gcal_event_id.sql` (already applied to production on 21 Nov 2026; a fresh database needs it).
8. **Test it.** Add a test event to your calendar tomorrow afternoon, wait a minute, and check `/book/` no longer offers those times. Book a free time yourself and check the event appears; cancel from the email link and check it disappears.

### Things that surprise people

- An **all-day event marked "Busy"** blocks that whole day. Set all-day reminders (birthdays, "finals") to **Free** so they do not.
- **Tentative and unanswered invitations** count as busy; **declined** ones and events marked **Free** do not.
- Times shown on `/book/` are cached for up to 45 seconds, so a new calendar event takes up to a minute to hide a slot. The booking step itself always checks live.
- Only the calendar you shared is read. Other calendars on your account are not.

## Not built yet

Google Meet links per booking (needs OAuth, see above) and inviting the visitor to the calendar event (needs domain-wide delegation, a Google Workspace feature).
