import { save } from './store.js';

// A student's saved profile, kept in data/state.json so it survives restarts:
//   offers:   listings { item, kind, price, floor, terms }. `floor` is the private lowest price.
//   schedule: { hours, free?, busy } — usual free times, plus fixed (hard) and movable (soft) commitments.
//   skills, courses, needs, privateNotes.

const KINDS = ['sell', 'lend', 'rent', 'give', 'service'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const dayOf = (d) => DAYS.find((x) => String(d).toLowerCase().startsWith(x.toLowerCase()));
const sameItem = (a, b) => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

export function normalizeOffer(o) {
  if (!o?.item) return null;
  const price = num(o.price);
  const floor = num(o.floor);
  return {
    item: String(o.item).trim(),
    kind: KINDS.includes(o.kind) ? o.kind : price != null ? 'sell' : 'lend',
    price,
    floor: floor != null && price != null && floor > price ? price : floor,
    terms: o.terms ? String(o.terms).trim() : '',
  };
}

function normalizeBlock(b) {
  const days = (b?.days || []).map(dayOf).filter(Boolean);
  if (!days.length || !/^\d{1,2}:\d{2}$/.test(b.start || '') || !/^\d{1,2}:\d{2}$/.test(b.end || '')) return null;
  const end = b.end === '23:59' ? '24:00' : b.end;
  return { days, start: b.start, end, ...(b.label !== undefined ? { label: b.label, hard: b.hard !== false } : {}) };
}

/** What a listing looks like to everyone else: no private lowest price. */
export const publicOffer = ({ floor, ...o }) => o;

export function offerText(o, { withFloor = false } = {}) {
  const price = o.price != null ? `$${o.price}` : o.kind === 'lend' || o.kind === 'give' ? 'free' : '';
  const floor = withFloor && o.floor != null ? ` (private lowest: $${o.floor})` : '';
  return `${o.item}: ${o.kind}${price ? ` ${price}` : ''}${floor}${o.terms ? `, ${o.terms}` : ''}`;
}

const clock = (t) => {
  const [h, m] = t.split(':').map(Number);
  if (h >= 24 || (h === 23 && m === 59)) return 'midnight';
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
};
const days = (list) => {
  const key = list.join(',');
  if (key === 'Mon,Tue,Wed,Thu,Fri') return 'weekdays';
  if (key === 'Sat,Sun') return 'weekends';
  if (list.length === 7) return 'every day';
  return list.join('/');
};
const blockText = (b) => `${days(b.days)} ${clock(b.start)}-${clock(b.end)}`;

/** One line, safe to share: when the student is usually free. Never names a commitment. */
export function availabilitySummary(s) {
  const free = s.schedule?.free;
  if (free?.length) return `usually free ${free.map(blockText).join(', ')}`;
  return s.availability || 'ask their agent';
}

export function applyProfileUpdates(owner, r) {
  owner.offers = (owner.offers || []).map(normalizeOffer).filter(Boolean);
  owner.schedule ||= { hours: ['09:00', '23:00'], busy: [] };
  owner.schedule.busy ||= [];

  for (const raw of r.addOffers || []) {
    const o = normalizeOffer(raw);
    if (!o) continue;
    const i = owner.offers.findIndex((x) => sameItem(x.item, o.item));
    if (i === -1) owner.offers.push(o);
    else owner.offers[i] = { ...owner.offers[i], ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== '')) };
  }
  for (const name of r.removeOffers || []) removeOffer(owner, name);

  for (const k of r.addSkills || []) if (k && !owner.skills.includes(k)) owner.skills.push(k);
  for (const n of r.addNeeds || []) if (n && !owner.needs.includes(n)) owner.needs.push(n);
  for (const p of r.privateNotes || []) if (p && !owner.privateNotes.includes(p)) owner.privateNotes.push(p);
  // Only real course codes ("CSE 310"), not class names.
  for (const raw of r.addCourses || []) {
    const c = String(raw || '').toUpperCase().replace(/^([A-Z]{2,4})\s*(\d{3}[A-Z]?)$/, '$1 $2');
    if (/^[A-Z]{2,4} \d{3}[A-Z]?$/.test(c) && !(owner.courses ||= []).includes(c)) owner.courses.push(c);
  }

  if (Array.isArray(r.setFree) && r.setFree.length) {
    const free = r.setFree.map(normalizeBlock).filter(Boolean);
    if (free.length) owner.schedule.free = free;
  }
  if (r.clearBusy) owner.schedule.busy = [];
  for (const raw of r.addBusy || []) {
    const b = normalizeBlock({ label: 'busy', ...raw });
    const dupe = b && owner.schedule.busy.some((x) => x.start === b.start && x.end === b.end && x.days.join() === b.days.join());
    if (b && !dupe) owner.schedule.busy.push(b);
  }
  if (r.availability) owner.availability = r.availability;
  save();
}

export function removeOffer(owner, name) {
  const before = owner.offers.length;
  owner.offers = owner.offers.filter((o) => !sameItem(o.item, name));
  save();
  return before - owner.offers.length;
}

/** The owner's full saved profile, private parts included. Only ever sent to the owner. */
export function describeProfile(s) {
  const offers = s.offers?.length ? s.offers.map((o) => `• ${offerText(o, { withFloor: true })}`).join('\n') : '• nothing listed yet';
  const sched = s.schedule || {};
  const free = sched.free?.length ? sched.free.map(blockText).join(', ') : `${clock(sched.hours?.[0] || '09:00')}-${clock(sched.hours?.[1] || '23:00')} most days (tell me your usual free times)`;
  const fixed = (sched.busy || []).filter((b) => b.hard !== false).map((b) => `${b.label}: ${blockText(b)}`);
  const flex = (sched.busy || []).filter((b) => b.hard === false).map((b) => `${b.label}: ${blockText(b)}`);
  return [
    `**Your listings** (other agents see these, never your lowest price)`,
    offers,
    '',
    `**Usually free:** ${free}`,
    `**Fixed** (private, never moves): ${fixed.join('; ') || 'none saved'}`,
    `**Can move** (private): ${flex.join('; ') || 'none saved'}`,
    '',
    `**Skills:** ${s.skills?.join(', ') || 'none yet'}`,
    `**Courses:** ${s.courses?.join(', ') || 'none yet'}`,
    `**Looking for:** ${s.needs?.join(', ') || 'nothing right now'}`,
    '',
    'Change anything by just telling me ("I\'m free weekdays after 6", "selling my desk lamp for $10, lowest $7"). `/remove` takes a listing down, `/forget` deletes it all.',
  ].join('\n');
}

/** Everything listed in the dorm, as other agents would see it. */
export function marketText(students) {
  const rows = students
    .filter((s) => s.offers?.length)
    .map((s) => `**${s.name}**\n${s.offers.map((o) => `• ${offerText(publicOffer(o))}`).join('\n')}`);
  return rows.length ? `**Sidequest Marketplace**\n\n${rows.join('\n\n')}\n\nWant something? Just DM me what you need.` : 'Nothing listed yet.';
}

export const WELCOME = `Hey, I'm your SideQuest agent. I trade favors and find times with other students' agents for you.

Tell me about yourself whenever, in plain words, and I'll remember it:
• what you'd sell, lend or rent ("selling my mini fridge for $45, won't go under $35")
• when you're usually free ("weekdays after 6pm, weekends after noon")
• classes, shifts and plans ("Orgo lab Tue/Thu 2-5pm") — these stay private, other agents only ever see your free time
• what you're good at ("I can debug Python")

\`/me\` shows what I've saved, \`/market\` shows what's for sale in the dorm, \`/help\` for the rest.`;

/** What other agents are allowed to see about a student. Lowest prices, notes and commitments never leave. */
export function publicProfile(s) {
  return {
    name: s.name,
    dorm: s.dorm,
    offers: (s.offers || []).map(normalizeOffer).filter(Boolean).map(publicOffer),
    skills: s.skills || [],
    needs: s.needs || [],
    courses: s.courses || [],
    availability: availabilitySummary(s),
  };
}

/** What only the student's own agent knows. */
export function privateProfile(s) {
  return {
    lowestPrices: (s.offers || []).filter((o) => o.floor != null).map((o) => ({ item: o.item, lowest: o.floor })),
    commitments: (s.schedule?.busy || []).map((b) => ({ ...b, canMove: b.hard === false })),
    notes: s.privateNotes || [],
  };
}
