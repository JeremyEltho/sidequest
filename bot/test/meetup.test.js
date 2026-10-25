import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeWindows, overlaps } from '../src/meetup.js';
import { SEED_STUDENTS } from '../src/seed.js';

const student = (id) => structuredClone(SEED_STUDENTS.find((s) => s.id === id));
const me = {
  name: 'You',
  schedule: { hours: ['10:00', '24:00'], busy: [
    { days: ['Mon', 'Wed', 'Fri'], start: '10:00', end: '11:00', label: 'CSE 310 lecture', hard: true },
    { days: ['Tue', 'Thu'], start: '18:00', end: '21:00', label: 'library shift', hard: true },
  ] },
};
const at = (h) => h * 60;

test('free windows skip fixed blocks', () => {
  const wed = freeWindows(student('sid')).filter((w) => w.day === 'Wed');
  assert.deepEqual(wed, [
    { day: 'Wed', start: at(16), end: at(19) },
    { day: 'Wed', start: at(21), end: at(24) },
  ]);
});

test('flexible plans only count when soft is on', () => {
  const mon = (soft) => freeWindows(student('levin'), { soft }).filter((w) => w.day === 'Mon');
  assert.equal(mon(true).length, 2);
  assert.deepEqual(mon(false), [{ day: 'Mon', start: at(9), end: at(23) }]);
});

test('Wednesday night with Sid and Levin lands on Wed 9-11pm', () => {
  const lists = [me, student('sid'), student('levin')].map((s) => freeWindows(s));
  const [slot] = overlaps(lists, 120, { preferredDays: ['Wed'], earliest: '18:00' });
  assert.deepEqual(slot, { day: 'Wed', start: at(21), end: at(23) });
});

test('an exact time that hits a fixed block moves to the closest time', () => {
  const lists = [me, student('sid')].map((s) => freeWindows(s));
  const [slot] = overlaps(lists, 90, { preferredDays: ['Wed'], at: '19:00' });
  assert.notEqual(slot.start, at(19));
  assert.deepEqual(slot, { day: 'Wed', start: at(21), end: at(22.5) });
});

test('moving a flexible plan opens the asked-for time', () => {
  const people = [me, student('levin')];
  const prefs = { preferredDays: ['Mon'], at: '18:00' };
  const strict = overlaps(people.map((s) => freeWindows(s)), 90, prefs)[0];
  const flexed = overlaps(people.map((s) => freeWindows(s, { soft: false })), 90, prefs)[0];
  assert.notEqual(strict.start, at(18));
  assert.deepEqual(flexed, { day: 'Mon', start: at(18), end: at(19.5) });
});

test('no overlap gives no slots', () => {
  const early = { schedule: { hours: ['08:00', '10:00'], busy: [] } };
  const late = { schedule: { hours: ['20:00', '23:00'], busy: [] } };
  assert.deepEqual(overlaps([freeWindows(early), freeWindows(late)], 60), []);
});

test('saved usual free times are the base, minus commitments', () => {
  const s = { schedule: { hours: ['09:00', '23:00'],
    free: [{ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '18:00', end: '24:00' }],
    busy: [{ days: ['Mon'], start: '19:00', end: '20:00', label: 'gym', hard: false }] } };
  assert.deepEqual(freeWindows(s).filter((w) => w.day === 'Mon'), [
    { day: 'Mon', start: at(18), end: at(19) },
    { day: 'Mon', start: at(20), end: at(24) },
  ]);
  assert.deepEqual(freeWindows(s).filter((w) => w.day === 'Sat'), []);
});

test('a typed clock time is exact, a word like night is not', async () => {
  const { typedClock } = await import('../src/meetup.js');
  for (const t of ['study wednesday at 7pm with sid', 'meet at 19:30', 'thursday 8 am', 'lunch at 12']) assert.ok(typedClock(t), t);
  for (const t of ['study wednesday night with sid', 'sometime tuesday afternoon', 'CSE 310 session']) assert.ok(!typedClock(t), t);
});
