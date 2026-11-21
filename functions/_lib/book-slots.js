/* ==========================================================================
   Slot arithmetic, pure functions only (no I/O), so it tests without a server.

   A slot is identified by its UTC start, 'YYYY-MM-DDTHH:MM:00Z'. Local dates
   are 'YYYY-MM-DD' in SAST. No onRequest* exports.
   ========================================================================== */

import {
    SLOT_MINUTES, MIN_NOTICE_HOURS, HORIZON_DAYS, UTC_OFFSET_HOURS,
    TERM_HOURS, HOLIDAY_HOURS, HOLIDAYS, BLACKOUT_DATES,
} from './book-config.js';

const MS_MIN = 60000;
const MS_HOUR = 3600000;
const MS_DAY = 86400000;
const OFFSET_MS = UTC_OFFSET_HOURS * MS_HOUR;
export const SLOT_ID = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

/** Local (SAST) calendar date string for a UTC instant. */
export function localDate(ms) {
    const d = new Date(ms + OFFSET_MS);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Local weekday number for a 'YYYY-MM-DD' date. */
export function weekdayOf(dateStr) {
    return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

export function addDays(dateStr, n) {
    return new Date(Date.parse(dateStr + 'T00:00:00Z') + n * MS_DAY).toISOString().slice(0, 10);
}

/** [open, close] in minutes after local midnight, or null if no calls that day. */
export function hoursFor(dateStr) {
    if (BLACKOUT_DATES.includes(dateStr)) return null;
    const holiday = HOLIDAYS.some(([a, b]) => dateStr >= a && dateStr <= b);
    const row = (holiday ? HOLIDAY_HOURS : TERM_HOURS)[weekdayOf(dateStr)];
    return row ? [toMin(row[0]), toMin(row[1])] : null;
}

/** All slot ids for a local date, in order. Ignores notice, horizon and bookings. */
export function slotsForDate(dateStr) {
    const h = hoursFor(dateStr);
    if (!h) return [];
    const midnightUtc = Date.parse(dateStr + 'T00:00:00Z') - OFFSET_MS;
    const out = [];
    for (let m = h[0]; m + SLOT_MINUTES <= h[1]; m += SLOT_MINUTES) out.push(iso(midnightUtc + m * MS_MIN));
    return out;
}

/** Earliest slot start (ms) and last local date that may be booked right now. */
export function bookingWindow(now) {
    const nowMs = now.getTime();
    return { earliest: nowMs + MIN_NOTICE_HOURS * MS_HOUR, lastDate: addDays(localDate(nowMs), HORIZON_DAYS) };
}

/** Is this exact id a real, open slot right now (ignoring whether it is already taken)? */
export function isBookable(id, now = new Date()) {
    if (typeof id !== 'string' || !SLOT_ID.test(id)) return false;
    const ms = Date.parse(id);
    if (!Number.isFinite(ms)) return false;
    const date = localDate(ms);
    const w = bookingWindow(now);
    if (ms < w.earliest || date > w.lastDate) return false;
    return slotsForDate(date).includes(id);
}

export function localTime(id) {
    const d = new Date(Date.parse(id) + OFFSET_MS);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function dayLabel(dateStr) {
    return `${WEEKDAYS[weekdayOf(dateStr)]} ${Number(dateStr.slice(8, 10))} ${MONTHS[Number(dateStr.slice(5, 7)) - 1]}`;
}

/** 'Mon 23 Nov, 15:30' */
export function whenLabel(id) {
    return `${dayLabel(localDate(Date.parse(id)))}, ${localTime(id)}`;
}

export function endOf(id) {
    return iso(Date.parse(id) + SLOT_MINUTES * MS_MIN);
}

/** Open slots from now to the horizon, grouped by local date, minus `taken` ids and any `busy` calendar intervals ([{start,end}] in ms). */
export function openDays(now, taken = new Set(), busy = []) {
    const w = bookingWindow(now);
    const days = [];
    for (let date = localDate(now.getTime()); date <= w.lastDate; date = addDays(date, 1)) {
        const slots = slotsForDate(date).filter((id) => {
            const ms = Date.parse(id);
            return ms >= w.earliest && !taken.has(id) && !busy.some((b) => ms < b.end && ms + SLOT_MINUTES * MS_MIN > b.start);
        });
        if (slots.length) days.push({ date, label: dayLabel(date), slots: slots.map((id) => ({ start: id, time: localTime(id) })) });
    }
    return days;
}

/** UTC range to query for taken slots: a day back to the end of the horizon, with slack. */
export function queryRange(now) {
    return { from: iso(now.getTime() - MS_DAY), to: iso(now.getTime() + (HORIZON_DAYS + 2) * MS_DAY) };
}
