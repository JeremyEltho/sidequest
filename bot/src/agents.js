import { askJSON } from './llm.js';
import { state, save, publicProfile, byName, newDeal } from './store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const beat = () => sleep(900 + Math.random() * 1400);

export function agentSystem(s) {
  return `You are ${s.name}'s personal agent in SideQuest, a favor-trading network for one college dorm (${s.dorm}).
You negotiate with other students' agents in a shared Discord channel called #agents-only on ${s.name}'s behalf.
Look out for ${s.name}, but be fair and friendly: the goal is a deal everyone actually says yes to.

${s.name}'s public profile (other agents can see this):
${JSON.stringify(publicProfile(s), null, 2)}

${s.name}'s private notes (only you know these). Use them to decide, but never repeat the details to other agents.
You may say a time doesn't work; never say why.
${JSON.stringify(s.privateNotes)}

Voice: short and casual, like a college student texting. One to three sentences. At most one emoji. Never make up items ${s.name} doesn't have.
Refer to students by name or as they/them ("${s.name}'s free...", "they can..."). Never write he, she, him, her, his, or hers about anyone.`;
}

/** Work out what the owner wants from a DM. */
export async function interpretDM(owner, text) {
  return askJSON(
    `${agentSystem(owner)}

${owner.name} just DMed you. Work out what they want.
- "request": they need something (an item, a favor, help).
- "meetup": they want to schedule something with other students (a study session, a group project meeting, planning a trip).
- "update": they're telling you what they can offer, their skills, needs, or schedule.
- "status": they're asking what you know about them or what's going on.
- "chat": anything else.
A request often also says what they can give in return; record that under addOffers/addSkills too.
Schedule facts (classes, work, plans) go in addBusy (days Mon..Sun, 24-hour times; hard = class, shift, exam; soft = habits and plans that could move), never in offers.

JSON shape:
{
  "intent": "request" | "meetup" | "update" | "status" | "chat",
  "request": { "item": string, "details": string, "neededBy": string, "returnBy": string | null, "maxBudget": number | null, "offering": string[] } | null,
  "meetup": { "topic": string, "with": string[], "course": string | null, "when": string, "durationMin": number, "preferredDays": string[], "earliest": "HH:MM" | null, "at": "HH:MM" | null, "place": string | null } | null,
  "addOffers": [{ "item": string, "terms": string }],
  "addSkills": string[],
  "addNeeds": string[],
  "privateNotes": string[],
  "addBusy": [{ "days": string[], "start": "HH:MM", "end": "HH:MM", "label": string, "hard": boolean }],
  "availability": string | null,
  "reply": string
}
"reply" is what you text ${owner.name} right now (for a request or meetup: say you're on it).
For a meetup, preferredDays uses Mon..Sun, durationMin defaults to 90, earliest is set for words like "night" (18:00) or "afternoon" (12:00), and "at" is set only when they typed a clock time ("at 7pm" = "19:00"); words like "night" or "evening" never set "at".`,
    text,
    { temperature: 0.3 },
  );
}

export function applyProfileUpdates(owner, r) {
  const has = (list, item) => list.some((x) => (x.item || x).toLowerCase() === item.toLowerCase());
  for (const o of r.addOffers || []) if (o?.item && !has(owner.offers, o.item)) owner.offers.push(o);
  for (const k of r.addSkills || []) if (k && !owner.skills.includes(k)) owner.skills.push(k);
  for (const n of r.addNeeds || []) if (n && !owner.needs.includes(n)) owner.needs.push(n);
  for (const p of r.privateNotes || []) if (p && !owner.privateNotes.includes(p)) owner.privateNotes.push(p);
  if (r.availability) owner.availability = r.availability;
  owner.schedule ||= { hours: ['09:00', '23:00'], busy: [] };
  for (const b of r.addBusy || []) if (b?.days?.length && b.start && b.end) owner.schedule.busy.push(b);
  save();
}

async function composeAsk(owner, request) {
  return askJSON(
    `${agentSystem(owner)}

Write the message you post in #agents-only asking the other agents for this. Mention the item, when it's needed,
when it can come back, what ${owner.name} can offer in return, and a budget if there is one.

JSON shape: { "message": string }`,
    { request, ownerOffers: owner.offers, ownerSkills: owner.skills },
  );
}

async function respondToAsk(responder, requester, request, askMessage) {
  return askJSON(
    `${agentSystem(responder)}

${requester.name}'s agent just posted an ask in #agents-only. Decide whether ${responder.name} can help.
Only offer things from ${responder.name}'s offers or skills, on terms that fit them (price, return time, a favor in return).
If ${requester.name} offers something ${responder.name} needs, you can ask for that instead of money.
For anything with a price, open at the listed price even if it's above their budget. Never offer your private
lowest price up front; keep it for when they counter.
If you have nothing relevant, set interested to false.

JSON shape:
{
  "interested": boolean,
  "offer": { "kind": "lend" | "rent" | "sell" | "swap" | "give", "item": string, "price": number | null, "wants": string | null, "window": string, "conditions": string } | null,
  "message": string
}
"message" is your reply in the channel (a short pass if not interested).`,
    { requesterProfile: publicProfile(requester), request, askMessage },
  );
}

async function decide(owner, request, offers) {
  return askJSON(
    `${agentSystem(owner)}

Other agents answered your ask. Compare the offers for ${owner.name}: price, what they want in return, timing, return conditions.
Give a rough new-price estimate for the item so ${owner.name} can tell if a price is fair (say it's an estimate).
If the best offer could reasonably be better (price over budget, a return time that clashes with ${owner.name}'s private notes,
or a fair counter like a lower price or a swap), write ONE counter message to that agent. Otherwise counter is null.

JSON shape:
{
  "bestIndex": number | null,
  "ranking": [{ "index": number, "why": string }],
  "marketEstimate": string,
  "counter": { "message": string, "proposedTerms": string } | null,
  "summaryForOwner": string
}`,
    { request, offers: offers.map((o, index) => ({ index, from: o.from.name, offer: o.offer, message: o.message })) },
    { temperature: 0.3 },
  );
}

async function respondToCounter(responder, requester, offer, counter) {
  return askJSON(
    `${agentSystem(responder)}

${requester.name}'s agent countered your offer. Accept if it still works for ${responder.name} (check the private notes), or hold firm, or meet halfway.

JSON shape:
{ "accept": boolean, "finalOffer": { "kind": string, "item": string, "price": number | null, "wants": string | null, "window": string, "conditions": string }, "message": string }`,
    { yourOffer: offer, counter },
    { temperature: 0.4 },
  );
}

async function findChain(owner, request) {
  const roster = state.students.map(publicProfile);
  return askJSON(
    `You are SideQuest's matchmaker. Nobody can give ${owner.name} what they asked for directly on acceptable terms.
Look for a favor chain of 3 people (2 others plus ${owner.name}) using only the public offers, skills and needs below:
each person gives one thing to the next, and the loop ends with ${owner.name} getting what they asked for.
Every step must use an item or skill the giver actually lists, and must meet something the receiver needs.
If no real chain exists, found is false. Never invent offers.

JSON shape:
{ "found": boolean, "steps": [{ "giver": string, "receiver": string, "what": string, "when": string }], "summary": string }`,
    { requester: owner.name, request, roster },
    { temperature: 0.2 },
  );
}

async function agentConfirm(s, deal) {
  return askJSON(
    `${agentSystem(s)}

The agents agreed on this plan. Confirm ${s.name} is in (or back out if it breaks a private note), in one short line for #agents-only.
JSON shape: { "accept": boolean, "message": string }`,
    { plan: deal.lines },
    { temperature: 0.5 },
  );
}

function offerLine(giver, receiver, offer) {
  const price = offer.price != null ? ` for $${offer.price}` : '';
  const wants = offer.wants ? `, in return for ${offer.wants}` : '';
  const window = offer.window ? ` (${offer.window})` : '';
  const cond = offer.conditions ? `. ${offer.conditions}` : '';
  return `${giver.name} ${offer.kind === 'sell' ? 'sells' : offer.kind === 'rent' ? 'rents' : 'lends'} ${receiver.name} the ${offer.item}${price}${wants}${window}${cond}`;
}

/**
 * The whole negotiation for one request.
 * io.post(student, text): post as that student's agent in #agents-only
 * io.dmText(student, text) / io.dmProposal(student, deal): talk to a real student
 */
export async function runRequest(owner, request, io) {
  const ask = await composeAsk(owner, request);
  ask.message ||= `anyone have a ${request.item} ${request.neededBy || 'soon'}? ${owner.name} can offer ${(request.offering || []).join(' or ') || 'something in return'}.`;
  await io.post(owner, ask.message);

  const others = state.students.filter((s) => s.id !== owner.id);
  const answers = await Promise.all(
    others.map((s) => respondToAsk(s, owner, request, ask.message).then((a) => ({ from: s, ...a })).catch(() => null)),
  );

  const offers = [];
  let passesShown = 0;
  for (const a of answers.filter(Boolean)) {
    if (a.interested && a.offer) {
      await beat();
      await io.post(a.from, a.message);
      offers.push(a);
    } else if (passesShown < 1 && a.message) {
      await beat();
      await io.post(a.from, a.message);
      passesShown++;
    }
  }

  if (!offers.length) return tryChain(owner, request, io);

  await beat();
  const d = await decide(owner, request, offers);
  const order = [d.bestIndex, ...(d.ranking || []).map((r) => r.index)]
    .filter((i, k, arr) => Number.isInteger(i) && offers[i] && arr.indexOf(i) === k);
  if (!order.length) return tryChain(owner, request, io);

  const best = offers[order[0]];
  let finalOffer = best.offer;
  if (d.counter?.message) {
    await io.post(owner, d.counter.message);
    await beat();
    const c = await respondToCounter(best.from, owner, best.offer, d.counter);
    await io.post(best.from, c.message);
    if (c.accept && c.finalOffer) finalOffer = c.finalOffer;
  }

  const alternatives = order.slice(1).map((i) => ({ fromId: offers[i].from.id, offer: offers[i].offer }));
  return propose(owner, request, io, {
    kind: 'direct',
    participants: [owner.id, best.from.id],
    lines: [offerLine(best.from, owner, finalOffer)],
    marketEstimate: d.marketEstimate,
    summary: d.summaryForOwner,
    alternatives,
  });
}

async function tryChain(owner, request, io) {
  const chain = await findChain(owner, request).catch(() => ({ found: false }));
  const people = (chain.steps || []).flatMap((s) => [byName(s.giver), byName(s.receiver)]);
  const valid = chain.found && chain.steps?.length >= 2 && people.every(Boolean) && people.some((p) => p.id === owner.id);
  if (!valid) {
    await io.post(owner, `no luck this round, thanks all. we'll check back if anyone gets a ${request.item}.`);
    await io.dmText(owner, `Nobody in the dorm has a ${request.item} they can spare right now, and I couldn't make a trade loop work. I'll keep it in mind and ping you if that changes.`);
    return null;
  }
  await io.post(owner, `no direct match, but I think there's a loop here: ${chain.summary}`);
  return propose(owner, request, io, {
    kind: 'chain',
    participants: [...new Set(people.map((p) => p.id))],
    lines: chain.steps.map((s) => `${s.giver} → ${s.receiver}: ${s.what}${s.when ? ` (${s.when})` : ''}`),
    summary: chain.summary,
    marketEstimate: null,
    alternatives: [],
  });
}

export async function propose(owner, request, io, plan) {
  const deal = newDeal({ requesterId: owner.id, request, ...plan });
  await beat();
  await io.post(owner, `sending this to ${owner.name} for a yes. everyone's agents, confirm on your side 👇`);

  for (const id of deal.participants) {
    const s = state.students.find((x) => x.id === id);
    if (s.id === owner.id) continue;
    if (s.simulated) {
      await beat();
      const c = deal.kind === 'meetup'
        ? { accept: true, message: `that works for ${s.name}, it's on their calendar 👍` }
        : await agentConfirm(s, deal).catch(() => ({ accept: true, message: 'works for us 👍' }));
      await io.post(s, c.message);
      deal.approvals[s.id] = c.accept ? 'yes' : 'no';
      if (!c.accept) {
        save();
        return fallback(deal, s, io);
      }
    } else {
      deal.approvals[s.id] = 'pending';
      await io.dmProposal(s, deal);
    }
  }
  deal.approvals[owner.id] = 'pending';
  save();
  if (owner.simulated) {
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
  await io.post(owner, `everyone's in. locked: ${deal.lines.join('; ')}`);
  for (const id of deal.participants) {
    const p = state.students.find((x) => x.id === id);
    if (!p.simulated) await io.dmText(p, `It's on.\n${deal.lines.map((l) => `• ${l}`).join('\n')}\nI'll remind you before each handoff.`);
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
  if (next.lines) {
    return propose(owner, deal.request, io, {
      kind: deal.kind,
      participants: deal.participants,
      lines: next.lines,
      summary: next.summary,
      marketEstimate: null,
      alternatives: deal.alternatives.slice(1),
    });
  }
  const giver = state.students.find((x) => x.id === next.fromId);
  return propose(owner, deal.request, io, {
    kind: 'direct',
    participants: [owner.id, giver.id],
    lines: [offerLine(giver, owner, next.offer)],
    marketEstimate: deal.marketEstimate,
    summary: `Next best option: ${giver.name}.`,
    alternatives: deal.alternatives.slice(1),
  });
}
