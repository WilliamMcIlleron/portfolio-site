import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotsForDate, hoursFor, isBookable, openDays, whenLabel, localTime, endOf } from '../functions/_lib/book-slots.js';

// Saturday 21 Nov 2026, 08:00 SAST.
const NOW = new Date('2026-11-21T06:00:00Z');

test('term weekday: 15:30 to 18:00 in 20 minute slots, last starts 17:30', () => {
    const s = slotsForDate('2026-11-23'); // Monday
    assert.equal(s.length, 7);
    assert.equal(localTime(s[0]), '15:30');
    assert.equal(localTime(s.at(-1)), '17:30');
    assert.equal(s[0], '2026-11-23T13:30:00Z'); // SAST is UTC+2
});

test('term Saturday: 09:00 to 17:00', () => {
    const s = slotsForDate('2026-11-28');
    assert.equal(localTime(s[0]), '09:00');
    assert.equal(localTime(s.at(-1)), '16:40');
    assert.equal(s.length, 24);
});

test('Sundays are closed, in term and in the holidays', () => {
    assert.deepEqual(slotsForDate('2026-11-22'), []);
    assert.deepEqual(slotsForDate('2026-12-06'), []);
});

test('holidays: Monday to Saturday 10:00 to 18:00, from 1 Dec to 12 Jan', () => {
    for (const d of ['2026-12-01', '2026-12-05', '2027-01-12']) {
        const s = slotsForDate(d);
        assert.equal(localTime(s[0]), '10:00', d);
        assert.equal(localTime(s.at(-1)), '17:40', d);
        assert.equal(s.length, 24, d);
    }
    assert.equal(hoursFor('2026-11-30')[0], 15 * 60 + 30); // the day before is still term
    assert.equal(hoursFor('2027-01-13')[0], 15 * 60 + 30); // the day school goes back
});

test('blackout days have no slots', () => {
    assert.deepEqual(slotsForDate('2026-12-25'), []);
    assert.deepEqual(slotsForDate('2027-01-01'), []);
});

test('finals are not blocked', () => {
    assert.equal(slotsForDate('2026-11-24').length, 7);
});

test('openDays respects the 12 hour notice and the 21 day horizon', () => {
    const days = openDays(NOW);
    assert.equal(days[0].date, '2026-11-23'); // Saturday's hours end before the 12 hour notice does
    assert.ok(days.every((d) => d.date <= '2026-12-12'));
    assert.equal(days.at(-1).date, '2026-12-12');
    assert.ok(days.every((d) => d.slots.length > 0));
    const late = new Date('2026-11-23T10:00:00Z'); // Mon 12:00 SAST: earliest is Tue 00:00, so Mon is gone
    assert.equal(openDays(late)[0].date, '2026-11-24');
    const edge = new Date('2026-11-23T01:30:00Z'); // 12 hours before 15:30 SAST
    assert.equal(openDays(edge)[0].date, '2026-11-23');
});

test('notice boundary is exact', () => {
    const slot = '2026-11-23T13:30:00Z';
    assert.equal(isBookable(slot, new Date('2026-11-23T01:30:00Z')), true);  // exactly 12 h before
    assert.equal(isBookable(slot, new Date('2026-11-23T01:30:01Z')), false); // one second short
});

test('taken slots are removed', () => {
    const taken = new Set(['2026-11-23T13:30:00Z']);
    assert.equal(openDays(NOW, taken)[0].slots.length, 6);
});

test('isBookable rejects everything that is not a real open slot', () => {
    assert.equal(isBookable('2026-11-23T13:30:00Z', NOW), true);
    for (const bad of [
        '2026-11-23T13:35:00Z',        // off the 20 minute grid
        '2026-11-23T13:30:00.000Z',    // wrong format
        '2026-11-23T13:30:00+02:00',
        '2026-11-23T12:30:00Z',        // 14:30 SAST, before opening
        '2026-11-23T15:50:00Z',        // 17:50 SAST, would end after close
        '2026-11-22T10:00:00Z',        // Sunday
        '2026-11-21T07:00:00Z',        // today, inside the notice window
        '2026-11-20T13:30:00Z',        // the past
        '2026-12-14T13:30:00Z',        // beyond the horizon
        '2026-12-25T10:00:00Z', 'not a date', '', null, undefined, 42, {}, [],
    ]) assert.equal(isBookable(bad, NOW), false, String(bad));
});

test('labels use South African time', () => {
    assert.equal(whenLabel('2026-11-23T13:30:00Z'), 'Mon 23 Nov, 15:30');
    assert.equal(endOf('2026-11-23T13:30:00Z'), '2026-11-23T13:50:00Z');
});

test('a slot near midnight UTC keeps the right local day', () => {
    // 2026-12-05 is a Saturday in the holidays: last slot 17:40 SAST = 15:40 UTC; first 10:00 SAST = 08:00 UTC.
    assert.equal(slotsForDate('2026-12-05')[0], '2026-12-05T08:00:00Z');
});
