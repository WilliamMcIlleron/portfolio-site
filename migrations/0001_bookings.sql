-- Bookings for williammcilleron.com/book/. Run once against the D1 database bound as DB:
--   npx wrangler d1 execute williammcilleron-bookings --remote --file=migrations/0001_bookings.sql
-- or paste it into the D1 console (Workers & Pages > D1 > your database > Console).

CREATE TABLE IF NOT EXISTS bookings (
    id                TEXT PRIMARY KEY,               -- the visitor-facing reference, e.g. WM-7K3Q9D
    slot_start        TEXT NOT NULL,                  -- UTC, 'YYYY-MM-DDTHH:MM:00Z'
    name              TEXT NOT NULL,
    email             TEXT NOT NULL,
    phone             TEXT NOT NULL,
    contact           TEXT NOT NULL CHECK (contact IN ('whatsapp', 'phone')),
    topic             TEXT NOT NULL,
    answers_json      TEXT NOT NULL DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
    cancel_token_hash TEXT NOT NULL,                  -- HMAC of the emailed token, never the token
    ip_hash           TEXT NOT NULL,                  -- HMAC of the IP, never the IP
    created_at        TEXT NOT NULL,
    cancelled_at      TEXT
);

-- This index is what makes a double booking impossible: two people cannot both
-- hold the same slot. A cancelled booking drops out of it, so the slot frees up.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_slot ON bookings (slot_start) WHERE status = 'booked';
CREATE UNIQUE INDEX IF NOT EXISTS bookings_token ON bookings (cancel_token_hash);
CREATE INDEX IF NOT EXISTS bookings_ip_recent ON bookings (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS bookings_email ON bookings (email, status, slot_start);
