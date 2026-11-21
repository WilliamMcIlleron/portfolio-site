/* ==========================================================================
   When William takes calls. Edit this file, nothing else, to change the hours.
   No onRequest* exports, so Pages never turns this file into a route.

   Times are South African Standard Time, UTC+2 all year (no daylight saving).
   ========================================================================== */

export const SLOT_MINUTES = 20;
export const MIN_NOTICE_HOURS = 12;
export const HORIZON_DAYS = 21;
export const UTC_OFFSET_HOURS = 2;

/**
 * Most calls on one school day (a term-time Monday to Friday). Saturdays, school holidays and
 * blackout days have no cap. Keeps evenings free for homework and exams.
 */
export const SCHOOL_DAY_CAP = 3;

/** The visitor is emailed a reminder this many hours before the call, but never before REMINDER_NOT_BEFORE that day. */
export const REMINDER_HOURS_BEFORE = 3;
export const REMINDER_NOT_BEFORE = '07:00';

/** Bookings are deleted this many days after the call. The privacy note on /book/ says 12 months. */
export const RETENTION_DAYS = 365;

/** Day of week: 0 Sunday ... 6 Saturday. Times are 'HH:MM' SAST, [open, close]. */
export const TERM_HOURS = {
    1: ['15:30', '18:00'], 2: ['15:30', '18:00'], 3: ['15:30', '18:00'], 4: ['15:30', '18:00'], 5: ['15:30', '18:00'],
    6: ['09:00', '17:00'], // William confirmed 21 Nov: 09:00 to 17:00, the same as holiday hours
};
export const HOLIDAY_HOURS = {
    1: ['09:00', '17:00'], 2: ['09:00', '17:00'], 3: ['09:00', '17:00'],
    4: ['09:00', '17:00'], 5: ['09:00', '17:00'], 6: ['09:00', '17:00'],
};

/**
 * School holidays, inclusive local dates, from William's school calendar.
 * The last one's end is a guess: the 2028 dates are not recorded yet [VERIFY].
 * Half terms count as term time.
 */
export const HOLIDAYS = [
    ['2026-12-01', '2027-01-12'],
    ['2027-04-10', '2027-05-03'],
    ['2027-08-07', '2027-09-06'],
    ['2027-12-04', '2028-01-12'],
];

/** Days with no calls at all. Only fixed-date public holidays are listed [VERIFY the 2027 movable ones]. */
export const BLACKOUT_DATES = ['2026-12-16', '2026-12-25', '2026-12-26', '2027-01-01'];
