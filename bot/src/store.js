import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_STUDENTS } from './seed.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'state.json');

function fresh() {
  return { students: structuredClone(SEED_STUDENTS), deals: {}, nextDeal: 1 };
}

function load() {
  if (!existsSync(DATA)) return fresh();
  try {
    return JSON.parse(readFileSync(DATA, 'utf8'));
  } catch {
    return fresh();
  }
}

export const state = load();

export function save() {
  mkdirSync(dirname(DATA), { recursive: true });
  writeFileSync(DATA, JSON.stringify(state, null, 2));
}

export function reset() {
  Object.assign(state, fresh());
  save();
}

/** The profile for a real Discord user, created the first time they DM the bot. */
export function studentForUser(user) {
  let s = state.students.find((x) => x.discordId === user.id);
  // A teammate from the demo roster takes over their agent the first time they show up.
  const seeded = !s && state.students.find(
    (x) => !x.discordId && x.discordUsername?.toLowerCase() === user.username?.toLowerCase(),
  );
  if (seeded) {
    Object.assign(seeded, { discordId: user.id, simulated: false });
    save();
    return seeded;
  }
  if (!s) {
    const display = user.globalName || user.username;
    s = {
      id: `u${user.id}`,
      discordId: user.id,
      name: display.charAt(0).toUpperCase() + display.slice(1),
      simulated: false,
      dorm: 'Hayden Hall',
      offers: [],
      skills: [],
      needs: [],
      courses: [],
      schedule: { hours: ['09:00', '23:00'], busy: [] },
      availability: 'unknown, ask before committing',
      privateNotes: [],
      color: 'D97757',
    };
    state.students.push(s);
    save();
  }
  return s;
}

export function byName(name) {
  const n = String(name || '').toLowerCase().replace(/'s agent$/, '').trim();
  return state.students.find((s) => s.name.toLowerCase() === n);
}

/** Remember what a student's agent said in #agents-only, so the student can audit it with !share. */
export function logShared(s, text) {
  s.sharedLog = [...(s.sharedLog || []), { at: Date.now(), text }].slice(-20);
  save();
}

/** Fill a real student's profile with a demo setup (offers, classes, private schedule). */
export function demoProfile(s) {
  Object.assign(s, {
    offers: [
      { item: 'USB-C laptop charger', terms: 'lend for an afternoon' },
      { item: '27-inch monitor', terms: 'lend for a weekend' },
    ],
    skills: ['debugging Python'],
    courses: ['CSE 310'],
    availability: 'afternoons and late evenings',
    privateNotes: ["can't do anything before 10am"],
    schedule: { hours: ['10:00', '24:00'], busy: [
      { days: ['Mon', 'Wed', 'Fri'], start: '10:00', end: '11:00', label: 'CSE 310 lecture', hard: true },
      { days: ['Tue', 'Thu'], start: '18:00', end: '21:00', label: 'library shift', hard: true },
    ] },
  });
  save();
}

/** What other agents are allowed to see about a student. Private notes never leave. */
export function publicProfile(s) {
  return {
    name: s.name,
    dorm: s.dorm,
    offers: s.offers,
    skills: s.skills,
    needs: s.needs,
    courses: s.courses || [],
    availability: s.availability,
  };
}

export function newDeal(data) {
  const id = String(state.nextDeal++);
  state.deals[id] = { id, status: 'proposed', createdAt: Date.now(), approvals: {}, ...data };
  save();
  return state.deals[id];
}

if (process.argv.includes('--reset')) {
  reset();
  console.log('SideQuest state reset to the demo roster.');
}
