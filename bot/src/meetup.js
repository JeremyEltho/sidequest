import { state, byName } from './store.js';
import { agentSystem, propose, beat } from './agents.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toMin = (t) => {
  const [h, m = '0'] = String(t).split(':');
  return Number(h) * 60 + Number(m);
};
const clock = (min) => {
  if (min >= 24 * 60) return 'midnight';
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
};
const say = (w) => `${w.day} ${clock(w.start)}-${clock(w.end)}`;
const names = (list) => list.map((p) => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1');
const dayOf = (d) => DAYS.find((x) => String(d).toLowerCase().startsWith(x.toLowerCase()));

/**
 * Free time is computed from the student's private schedule, never guessed by the model.
 * With soft = false, plans marked as movable (gym, dinners) don't count as busy.
 */
export function freeWindows(s, { soft = true } = {}) {
  const sched = s.schedule || { hours: ['09:00', '23:00'], busy: [] };
  const [open, close] = sched.hours.map(toMin);
  const out = [];
  for (const day of DAYS) {
    // Saved usual free times win; otherwise the whole waking day counts, minus commitments.
    let free = sched.free?.length
      ? sched.free.filter((f) => f.days.includes(day)).map((f) => ({ start: toMin(f.start), end: toMin(f.end) }))
      : [{ start: open, end: close }];
    for (const b of sched.busy) {
      if (!b.days.includes(day) || (!b.hard && !soft)) continue;
      const bs = toMin(b.start);
      const be = toMin(b.end);
      free = free.flatMap((f) => {
        if (be <= f.start || bs >= f.end) return [f];
        return [{ start: f.start, end: bs }, { start: be, end: f.end }].filter((x) => x.end - x.start >= 30);
      });
    }
    out.push(...free.map((f) => ({ day, ...f })));
  }
  return out;
}

/** Every slot of `duration` minutes inside a free window for every person, preferred day and time first. */
export function overlaps(lists, duration, { preferredDays = [], earliest = null, at = null } = {}) {
  const exact = at ? toMin(at) : null;
  const after = exact ?? (earliest ? toMin(earliest) : 0);
  const slots = [];
  for (const day of DAYS) {
    let common = [{ start: 0, end: 24 * 60 }];
    for (const windows of lists) {
      const next = [];
      for (const a of common) for (const b of windows.filter((w) => w.day === day)) {
        const start = Math.max(a.start, b.start);
        const end = Math.min(a.end, b.end);
        if (end > start) next.push({ start, end });
      }
      common = next;
    }
    for (const c of common) {
      if (c.end - c.start < duration) continue;
      // Start at `earliest` when the window allows it.
      const start = c.start < after && c.end - after >= duration ? after : c.start;
      slots.push({ day, start, end: start + duration });
    }
  }
  // Right day first, then (for an exact time) closest to it, else at or after `earliest`.
  const off = (s) => (preferredDays.length && !preferredDays.includes(s.day) ? 1e5 : 0)
    + (exact != null ? Math.abs(s.start - exact) : s.start < after ? 1e4 : 0);
  return slots.sort((a, b) => off(a) - off(b) || DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start - b.start);
}

/**
 * What an agent posts: its own student's free windows, word for word, and nothing about why.
 * Built from the computed windows instead of the model so the times are always exact.
 */
function voice(s, meetup, windows, flexed) {
  const onDay = (w) => !meetup.preferredDays?.length || meetup.preferredDays.includes(w.day);
  const preferred = windows.filter(onDay).map(say);
  const other = windows.filter((w) => !onDay(w)).slice(0, 3).map(say);
  if (flexed) return `${s.name} can move something to make it work. updated: ${preferred.join(', ') || other.join(', ')}`;
  if (!preferred.length) return `${s.name}'s booked ${meetup.when}. other options: ${other.join(', ') || 'none this week'}`;
  return `${s.name}'s free ${preferred.join(', ')}${other.length ? `. also open ${other.join(', ')}` : ''}`;
}

export async function runMeetup(owner, meetup, io) {
  meetup.durationMin = Math.max(30, Number(meetup.durationMin) || 90);
  const named = (meetup.with || []).map(byName).filter((s) => s && s.id !== owner.id);
  // Named people win; a course only picks invitees when nobody was named.
  const byCourse = meetup.course && !named.length
    ? state.students.filter((s) => s.id !== owner.id && (s.courses || []).some((c) => c.toLowerCase() === meetup.course.toLowerCase()))
    : [];
  const invitees = [...new Map([...named, ...byCourse].map((s) => [s.id, s])).values()].slice(0, 4);
  if (!invitees.length) {
    await io.dmText(owner, `I couldn't find anyone to invite for that. Name people in the dorm, or a course you share (like CSE 310).`);
    return null;
  }

  const people = [owner, ...invitees];
  meetup.preferredDays = (meetup.preferredDays || []).map(dayOf).filter(Boolean);
  // Only a clock time the student actually typed ("at 7pm") is an exact start; "night" just means after earliest.
  if (meetup.at && !/\d/.test(meetup.when || '')) {
    meetup.earliest ||= meetup.at;
    meetup.at = null;
  }
  const prefs = { preferredDays: meetup.preferredDays, earliest: meetup.earliest || null, at: meetup.at || null };
  const all = people.length === 2 ? 'both of us' : `all ${people.length} of us`;
  await io.post(owner, `planning a ${meetup.durationMin}-min ${meetup.topic} (${meetup.when}) with ${names(invitees)}. what windows work for your people?`);

  // Round 1: every agent shares free windows, nothing else.
  let windows = people.map((s) => freeWindows(s));
  const posts = people.map((s, i) => voice(s, meetup, windows[i], false));
  for (const [i, s] of people.entries()) {
    await beat();
    await io.post(s, posts[i]);
  }

  let slots = overlaps(windows, meetup.durationMin, prefs);
  const fitsPrefs = (slot) =>
    slot
    && (!prefs.preferredDays.length || prefs.preferredDays.includes(slot.day))
    && (prefs.at ? slot.start === toMin(prefs.at) : !prefs.earliest || slot.start >= toMin(prefs.earliest));
  let flexNote = '';

  // Conflict: nothing fits the asked-for day and time, so agents check what can move.
  if (!fitsPrefs(slots[0])) {
    await beat();
    await io.post(owner, `conflict: nothing works for ${all} ${meetup.when}. anyone have something that can move?`);
    const flexed = people.map((s) => freeWindows(s, { soft: false }));
    const flexSlots = overlaps(flexed, meetup.durationMin, prefs);
    if (fitsPrefs(flexSlots[0])) {
      const slot = flexSlots[0];
      const movers = people.filter((s, i) => !windows[i].some((w) => w.day === slot.day && w.start <= slot.start && w.end >= slot.end));
      for (const s of movers) {
        await beat();
        await io.post(s, voice(s, meetup, flexed[people.indexOf(s)], true));
        await io.dmText(s, `Heads up: to make ${meetup.topic} work, I told the others you can move something on ${slot.day}. You'll get the final time to approve.`);
      }
      windows = flexed;
      slots = flexSlots;
      flexNote = ` after ${names(movers)} moved a flexible plan`;
    } else if (slots.length) {
      await beat();
      const holdouts = people.filter((s) => !overlaps([freeWindows(s, { soft: false })], meetup.durationMin, prefs).some(fitsPrefs));
      const who = holdouts.length ? `${names(holdouts)} ${holdouts.length > 1 ? 'have' : 'has'} something fixed then` : "our free times don't line up then";
      await io.post(owner, `can't move it: ${who}. closest time that works for everyone is ${say(slots[0])}.`);
      flexNote = `. ${meetup.when} couldn't work (${who}), so this is the closest time`;
    }
  }

  if (!slots.length) {
    await io.post(owner, `no time works for everyone this week.`);
    await io.dmText(owner, `There's no ${meetup.durationMin}-minute window this week where ${people.length === 2 ? 'you\'re both' : 'all of you are'} free, even after checking what can move. Want me to try a shorter session or fewer people?`);
    return null;
  }

  const place = meetup.place || 'Hayden Hall study room';
  const toDeal = (slot) => ({
    slot: { ...slot, place, label: say(slot) },
    lines: [`${meetup.topic}: ${say(slot)} at ${place}`, `With: ${names(people)}`],
    summary: `Fits everyone's schedule${flexNote}. Agents only shared free windows; nobody's classes or plans left their own agent.`,
  });

  await beat();
  await io.post(owner, `found it: ${say(slots[0])}${slots.length > 1 ? ` (${Math.min(slots.length - 1, 3)} backups if anyone passes)` : ''}.`);
  return propose(owner, meetup, io, {
    kind: 'meetup',
    participants: people.map((p) => p.id),
    ...toDeal(slots[0]),
    marketEstimate: null,
    alternatives: slots.slice(1, 4).map(toDeal),
  });
}
