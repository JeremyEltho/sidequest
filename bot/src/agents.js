import { askJSON } from './llm.js';
import { state, save, newDeal } from './store.js';
import { publicProfile, privateProfile, applyProfileUpdates } from './profile.js';

export { applyProfileUpdates };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const beat = () => sleep(900 + Math.random() * 1400);

export function agentSystem(s) {
  return `You are ${s.name}'s personal agent in SideQuest, a favor-trading network for one college dorm (${s.dorm}).
You negotiate with other students' agents in a shared Discord channel called #agents-only on ${s.name}'s behalf.
Look out for ${s.name}, but be fair and friendly: the goal is a deal everyone actually says yes to.

${s.name}'s public profile (other agents can see this):
${JSON.stringify(publicProfile(s), null, 2)}

What only you know about ${s.name}. Use it to decide, but never repeat it to other agents.
You may say a time doesn't work; never say why. Never reveal a lowest price; you can come down to it when countered.
${JSON.stringify(privateProfile(s), null, 2)}

Voice: short and casual, like a college student texting. One to three sentences. At most one emoji. Never make up items ${s.name} doesn't have.
Refer to students by name or as they/them ("${s.name}'s free...", "they can..."). Never write he, she, him, her, his, or hers about anyone.`;
}

/** Work out what the owner wants from a DM. */
export async function interpretDM(owner, text, now = new Date(), waitingDeal = '') {
  const day = (d) => d.toLocaleDateString('en-US', { weekday: 'long' });
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const today = `${day(now)}, ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
  return askJSON(
    `${agentSystem(owner)}

Today is ${today}. "tomorrow" is ${day(tomorrow)}; "tonight" is ${day(now)} evening.
${waitingDeal ? `A deal is waiting for ${owner.name}'s answer: ${waitingDeal}. If they ask you to try a different price ("can u try 800", "ask for 700", "make it 650"), that is a "counter" on this deal. It is NOT a change to their listing.` : ''}

${owner.name} just DMed you. Work out what they want.
- "request": they need something (an item, a favor, help). "item" is just the thing ("speaker", "broom"), never a person's name or possessive: "parthiva's speaker" is item "speaker". "maxBudget" is the most they said they would pay, or null if they gave no number; never guess one.
- "meetup": they want to schedule something with other students: a study session, a group project meeting, planning a trip, or a meet-up to hand something off or pick it up. Asking "when is parthiva free to hand off the macbook" is a meetup: set topic to what it is for ("macbook handoff") and with to the person. Even a bare "when is pt free" is a meetup, with topic "meet up".
- "counter": only when a deal is waiting (see above) and they want a different price on it.
- "update": they're telling you what they can offer, their skills, needs, or schedule.
- "status": they're asking what you know about them or what's going on.
- "chat": anything else.
A request often also says what they can give in return; record that under addOffers/addSkills too.
Listings go in addOffers: kind is sell, lend, rent, give or service; price is what they're asking; floor is a lowest
price only if they said one ("won't go under $35").
Copy the item's name the way they said it ("macbook", "desk lamp"); never add category words like "computer" or "item". To take a listing down, put its name in removeOffers.
Usual free times ("I'm usually free weekdays after 6") go in setFree and replace the old ones.
Commitments (classes, work, plans) go in addBusy: days Mon..Sun, 24-hour times, hard = class, shift or exam,
soft = habits and plans that could move. Never put a commitment in offers. Course codes go in addCourses.

JSON shape:
{
  "intent": "request" | "meetup" | "counter" | "update" | "status" | "chat",
  "counter": { "price": number } | null,
  "request": { "item": string, "details": string, "neededBy": string, "returnBy": string | null, "maxBudget": number | null, "offering": string[] } | null,
  "meetup": { "topic": string, "with": string[], "course": string | null, "when": string, "durationMin": number, "preferredDays": string[], "earliest": "HH:MM" | null, "at": "HH:MM" | null, "place": string | null } | null,
  "addOffers": [{ "item": string, "kind": "sell" | "lend" | "rent" | "give" | "service", "price": number | null, "floor": number | null, "terms": string }],
  "removeOffers": string[],
  "setFree": [{ "days": string[], "start": "HH:MM", "end": "HH:MM" }] | null,
  "addCourses": string[],
  "addSkills": string[],
  "addNeeds": string[],
  "privateNotes": string[],
  "addBusy": [{ "days": string[], "start": "HH:MM", "end": "HH:MM", "label": string, "hard": boolean }],
  "availability": string | null,
  "reply": string
}
"reply" is what you text ${owner.name} right now (for a request or meetup: say you're on it).
For a meetup, preferredDays uses Mon..Sun, durationMin defaults to 90 (30 for a quick handoff, pickup or chat), earliest is set for words like "night" (18:00) or "afternoon" (12:00), and "at" is set only when they typed a clock time ("at 7pm" = "19:00"); words like "night" or "evening" never set "at".`,
    text,
    { temperature: 0.3 },
  );
}

export async function propose(owner, request, io, plan) {
  const deal = newDeal({ requesterId: owner.id, request, ...plan });
  await beat();
  await io.post(owner, `sending this to ${owner.name} for a yes. everyone's agents, confirm on your side 👇`);

  // Agents for demo students (and everyone, in a simulation) confirm on their own: the terms came from
  // their own listings and limits, so there's nothing for them to back out of. Real students decide themselves.
  const auto = (p) => p.simulated || plan.simulation;
  for (const id of deal.participants) {
    const s = state.students.find((x) => x.id === id);
    if (s.id === owner.id) continue;
    if (auto(s)) {
      await beat();
      await io.post(s, deal.kind === 'meetup' ? `that works for ${s.name}, it's on their calendar 👍` : `${s.name}'s in 👍`);
      deal.approvals[s.id] = 'yes';
    } else {
      deal.approvals[s.id] = 'pending';
      await io.dmProposal(s, deal);
    }
  }
  deal.approvals[owner.id] = 'pending';
  save();
  if (auto(owner)) {
    // A demo student's agent signs off for them.
    await beat();
    await io.post(owner, `${owner.name} said yes 👍`);
    await approve(deal, owner, io);
  } else {
    await io.dmProposal(owner, deal);
  }
  return deal;
}

/** Someone said yes. Lock the deal once everyone has. */
export async function approve(deal, s, io) {
  deal.approvals[s.id] = 'yes';
  save();
  if (!Object.values(deal.approvals).every((v) => v === 'yes')) {
    if (deal.status === 'proposed') await io.dmText(s, 'Got your yes. Waiting on the others.');
    return;
  }
  deal.status = 'live';
  save();
  io.remind?.(deal);
  const owner = state.students.find((x) => x.id === deal.requesterId);
  const who = deal.participants.map((id) => state.students.find((x) => x.id === id).name).join(', ').replace(/, ([^,]*)$/, ' and $1');
  if (deal.slot) {
    await io.post(owner, `✅ locked: ${deal.request?.topic ?? 'meetup'}, ${deal.slot.label} at ${deal.slot.place}. ${who}, see you there.`);
  } else {
    await io.post(owner, `✅ locked\n${deal.lines.map((l) => `• ${l}`).join('\n')}\n${deal.simulation ? '(simulated deal, no DMs sent)' : `handoff details go to ${who} by DM.`}`);
  }
  for (const id of deal.participants) {
    const p = state.students.find((x) => x.id === id);
    if (p.simulated || deal.simulation) continue;
    if (deal.slot) {
      await io.dmText(p, `It's on: **${deal.request?.topic ?? 'meetup'}**, ${deal.slot.label} at ${deal.slot.place}, with ${who}.\nI'll remind you 30 minutes before. Reply here if something comes up.`);
    } else {
      const others = deal.participants.map((pid) => state.students.find((x) => x.id === pid)).filter((x) => x && x.id !== p.id).map((x) => x.name);
      const next = deal.kind === 'direct' && others.length === 1 ? `\nNext: ask me "when is ${others[0]} free to hand it off" and I'll find a time that works for both of you.` : '';
      await io.dmText(p, `It's on.\n${deal.lines.map((l) => `• ${l}`).join('\n')}${next}\nReply here if plans change and I'll let the other agents know.`);
    }
  }
}

/** Someone passed. Nobody else is told who; try the next option. */
export async function decline(deal, s, io) {
  deal.approvals[s.id] = 'no';
  return fallback(deal, s, io);
}

async function fallback(deal, s, io) {
  deal.status = 'declined';
  save();
  const owner = state.students.find((x) => x.id === deal.requesterId);
  await io.post(owner, `this one's off, no worries. checking the next option.`);
  const next = deal.alternatives?.[0];
  if (!next) {
    if (s.id !== owner.id) await io.dmText(owner, `That deal fell through on the other side. I'm out of options for now, but I'll keep looking.`);
    else await io.dmText(owner, `No problem, nobody's told you passed. That was the last option I had; ask again anytime.`);
    return null;
  }
  return propose(owner, deal.request, io, {
    kind: deal.kind,
    simulation: deal.simulation,
    participants: next.participants ?? deal.participants,
    lines: next.lines,
    summary: next.summary,
    marketEstimate: deal.marketEstimate ?? null,
    slot: next.slot,
    alternatives: deal.alternatives.slice(1),
  });
}

/**
 * interpretDM, but the model sometimes says "meetup" (or "request", or "counter") and forgets to fill in the details.
 * When that happens, ask again, telling it exactly what was missing, before giving up.
 */
export async function interpretComplete(owner, text, now = new Date(), waitingDeal = '') {
  const missing = (r) => (r.intent === 'meetup' && !r.meetup?.with?.length)
    || (r.intent === 'request' && !r.request?.item)
    || (r.intent === 'counter' && !(Number(r.counter?.price) > 0));
  let r = await interpretDM(owner, text, now, waitingDeal);
  for (let i = 0; i < 2 && missing(r); i++) {
    r = await interpretDM(owner, `${text}\n\n(Your last answer left the "${r.intent}" object empty. Fill it in completely from this message.)`, now, waitingDeal);
  }
  r.incomplete = missing(r);
  return r;
}
