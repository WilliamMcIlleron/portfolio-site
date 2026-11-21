-- Visitor reminder: when the reminder email for a booking was sent (NULL = not yet). Claimed
-- before sending so overlapping cron runs cannot send it twice; released if the send fails.
-- Run once against the D1 database bound as DB.
ALTER TABLE bookings ADD COLUMN reminded_at TEXT;
