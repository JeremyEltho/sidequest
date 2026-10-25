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
  if (!s) {
    s = {
      id: `u${user.id}`,
      discordId: user.id,
      name: user.globalName || user.username,
      simulated: false,
      dorm: 'Hayden Hall',
      offers: [],
      skills: [],
      needs: [],
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

/** What other agents are allowed to see about a student. Private notes never leave. */
export function publicProfile(s) {
  return {
    name: s.name,
    dorm: s.dorm,
    offers: s.offers,
    skills: s.skills,
    needs: s.needs,
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
