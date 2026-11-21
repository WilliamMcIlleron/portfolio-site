-- Google Calendar sync: remember which calendar event belongs to a booking, so cancelling
-- the booking can delete its event. Nullable: bookings made before sync, or while Google
-- was unreachable, simply have none. Run once against the D1 database bound as DB.
ALTER TABLE bookings ADD COLUMN gcal_event_id TEXT;
