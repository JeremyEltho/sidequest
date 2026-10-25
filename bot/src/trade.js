import { askJSON } from './llm.js';
import { state, byName } from './store.js';
import { propose, beat } from './agents.js';
import { normalizeOffer } from './profile.js';

// Trades are decided in code from saved listings, so agents can't offer things nobody has,
// ask for things nobody needs, or back out of their own price. The model only helps match synonyms.

const STOP = new Set(['the', 'and', 'for', 'with', 'some', 'someone', 'anyone', 'need', 'needs', 'have', 'has', 'can',
  'from', 'that', 'this', 'your', 'help', 'look', 'looking', 'tonight', 'today', 'tomorrow', 'week', 'old', 'new', 'used']);
const words = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const sameWord = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))));
/** True when two phrases share a meaningful word ("mini fridge" / "mini fridge (3.1 cu ft)"). */
export const related = (a, b) => words(a).some((x) => words(b).some((y) => sameWord(x, y)));

const article = (item) => (/^(a|an|the|my|some)\s/i.test(item) ? '' : /^[aeiou]/i.test(item) ? 'an ' : 'a ');
const money = (n) => `$${Number(n).toLocaleString('en-US')}`;

/** Every listing in the dorm except the requester's own, with skills counted as services. */
function dormListings(owner) {
  return state.students
    .filter((s) => s.id !== owner.id)
    .flatMap((s) => [
      ...(s.offers || []).map(normalizeOffer).filter(Boolean),
      ...(s.skills || []).map((k) => ({ item: k, kind: 'service', price: null, floor: null, terms: '' })),
    ].map((offer) => ({ holder: s, offer })));
}

/** Listings that are the thing asked for. Word overlap first; the model only picks from real listings for synonyms. */
async function matchListings(request, listings) {
  const direct = listings.filter((l) => related(request.item, l.offer.item));
  if (direct.length || !listings.length) return direct;
  const r = await askJSON(
    `Someone in a dorm marketplace asked for: "${request.item}".
Label every numbered listing:
- "same": it is that thing (a "Digicam" is a camera, a "minifridge" is a mini fridge)
- "substitute": a different thing that does the same job (a Swiffer instead of a broom)
- "related": used with it or around it, but not it (a tripod for a camera, a dustpan for a broom)
- "unrelated"
JSON shape: { "labels": [{ "i": number, "label": "same" | "substitute" | "related" | "unrelated" }] }`,
    listings.map((l, i) => `${i}: ${l.offer.item}`).join('\n'),
    { temperature: 0 },
  ).catch(() => ({ labels: [] }));
  const ok = (r.labels || []).filter((x) => x.label === 'same' || x.label === 'substitute');
  // "same" beats "substitute".
  return ok.sort((a, b) => (a.label === 'same' ? 0 : 1) - (b.label === 'same' ? 0 : 1))
    .map((x) => x.i).filter((i) => Number.isInteger(i) && listings[i]).map((i) => listings[i]);
}

/** What the holder could fairly ask in return for a free loan: one of their own needs that the requester can cover. */
function wantFor(holder, owner, request) {
  const canGive = [
    ...(owner.offers || []).map((o) => o.item),
    ...(owner.skills || []),
    ...(request.offering || []),
  ];
  return (holder.needs || []).find((n) => canGive.some((g) => related(n, g))) || null;
}

function opening({ holder, offer }, owner, request) {
  const priced = offer.kind === 'sell' || offer.kind === 'rent';
  return {
    holder,
    offer,
    price: priced ? offer.price : null,
    wants: priced ? null : wantFor(holder, owner, request),
  };
}

function openingText(o) {
  const { holder, offer } = o;
  const terms = offer.terms ? ` (${offer.terms})` : '';
  if (o.price != null) return `${holder.name} has ${article(offer.item)}${offer.item} for ${offer.kind === 'rent' ? 'rent at ' : ''}${money(o.price)}${terms}.`;
  const what = offer.kind === 'service' ? `can help with ${offer.item}` : `can ${offer.kind === 'give' ? 'give' : 'lend'} you ${article(offer.item)}${offer.item}`;
  return `${holder.name} ${what}${terms}. ${o.wants ? `in return, ${holder.name} could use: ${o.wants}.` : 'no strings attached.'}`;
}

function dealLine(o, owner, price) {
  const { holder, offer } = o;
  const verb = offer.kind === 'sell' ? 'sells' : offer.kind === 'rent' ? 'rents' : offer.kind === 'give' ? 'gives' : offer.kind === 'service' ? 'helps' : 'lends';
  const what = offer.kind === 'service' ? `${owner.name} with ${offer.item}` : `${owner.name} the ${offer.item}`;
  return `${holder.name} ${verb} ${what}${price != null ? ` for ${money(price)}` : ''}${o.wants ? `, in return for: ${o.wants}` : ''}${offer.terms ? ` (${offer.terms})` : ''}`;
}

/** Cheapest first: free with nothing asked, then free for a favor, then by price. */
const cost = (o) => (o.price == null ? (o.wants ? 1 : 0) : 10 + o.price);

async function priceCheck(item) {
  const r = await askJSON(
    `Give a rough, typical price for "${item}" so a college student can tell if an offer is fair.
One short phrase, like "new ones are usually around $90-$120". Say it's an estimate. JSON shape: { "estimate": string }`,
    '',
    { temperature: 0 },
  ).catch(() => null);
  return r?.estimate || null;
}

/**
 * One request, start to finish.
 * io.post(student, text) posts as that student's agent; io.dmText / io.dmProposal talk to real students.
 * opts.simulation: a demo deal, every agent confirms on its own and nobody gets DMs.
 */
export async function runRequest(owner, request, io, opts = {}) {
  const budget = request.maxBudget != null ? Number(request.maxBudget) : null;
  const offering = (request.offering || []).filter(Boolean);
  await io.post(owner, `${owner.name} is looking for ${article(request.item)}${request.item}${request.neededBy ? ` ${request.neededBy}` : ''}${budget != null ? `, budget ${money(budget)}` : ''}${request.returnBy ? `, back by ${request.returnBy}` : ''}.${offering.length ? ` can offer ${offering.join(' or ')} in return.` : ''} anyone?`);

  const matches = await matchListings(request, dormListings(owner));
  if (!matches.length) return tryChain(owner, request, io, opts);

  // One opening per student (their best listing for this), posted from the real listing.
  const byHolder = new Map();
  for (const m of matches.map((l) => opening(l, owner, request)).sort((a, b) => cost(a) - cost(b))) {
    if (!byHolder.has(m.holder.id)) byHolder.set(m.holder.id, m);
  }
  const openings = [...byHolder.values()];
  for (const o of openings) {
    await beat();
    await io.post(o.holder, openingText(o));
  }

  const best = openings[0];
  let price = best.price;
  // Haggle once: counter at the budget; the seller takes it if it's at or above their private lowest,
  // otherwise meets in the middle, never below that lowest.
  if (price != null && budget != null && price > budget) {
    await beat();
    await io.post(owner, `${best.holder.name}, could you do ${money(budget)}?`);
    const floor = best.offer.floor ?? price;
    await beat();
    if (budget >= floor) {
      price = budget;
      await io.post(best.holder, `${money(budget)} works. deal.`);
    } else {
      price = Math.max(floor, Math.ceil((best.price + budget) / 2));
      await io.post(best.holder, price < best.price ? `best I can do is ${money(price)}.` : `sorry, ${money(price)} is firm.`);
    }
  }

  const estimate = best.price != null ? await priceCheck(best.offer.item) : null;
  const why = (o, p) => {
    const parts = [];
    if (p == null) parts.push(o.wants ? `Free, for a favor you can do (${o.wants}).` : 'Free, nothing asked in return.');
    else parts.push(budget != null ? `${money(p)}, ${p <= budget ? `within your ${money(budget)} budget` : `over your ${money(budget)} budget`}.` : `${money(p)}.`);
    if (o === best && openings.length > 1) parts.push(`Best of ${openings.length} offers.`);
    return parts.join(' ');
  };

  return propose(owner, request, io, {
    kind: 'direct',
    simulation: !!opts.simulation,
    participants: [owner.id, best.holder.id],
    lines: [dealLine(best, owner, price)],
    summary: why(best, price),
    marketEstimate: estimate,
    alternatives: openings.slice(1).map((o) => ({
      participants: [owner.id, o.holder.id],
      lines: [dealLine(o, owner, o.price)],
      summary: `Next best option. ${why(o, o.price)}`,
    })),
  });
}

/** No direct match: look for a 3-person loop, and only accept one where every step is a real listing and a real need. */
async function tryChain(owner, request, io, opts) {
  const roster = state.students.map((s) => ({
    name: s.name,
    has: [...(s.offers || []).map((o) => o.item), ...(s.skills || [])],
    needs: s.id === owner.id ? [request.item] : s.needs || [],
  }));
  const chain = await askJSON(
    `Find a favor loop of exactly 3 people that ends with ${owner.name} getting "${request.item}".
Each step: a giver gives one thing from their own "has" list to a receiver who has it on their "needs" list.
Use only the lists below, word for word. If no such loop exists, found is false.
JSON shape: { "found": boolean, "steps": [{ "giver": string, "receiver": string, "what": string }] }`,
    roster,
    { temperature: 0 },
  ).catch(() => ({ found: false }));

  const steps = chain.found ? chain.steps || [] : [];
  const real = steps.length >= 2 && steps.every((st) => {
    const g = byName(st.giver);
    const r = byName(st.receiver);
    if (!g || !r || g.id === r.id) return false;
    const gives = [...(g.offers || []).map((o) => o.item), ...(g.skills || [])].some((h) => related(h, st.what));
    const needs = (r.id === owner.id ? [request.item] : r.needs || []).some((n) => related(n, st.what));
    return gives && needs;
  }) && steps.some((st) => byName(st.receiver)?.id === owner.id);

  if (!real) {
    await io.post(owner, `nobody has ${article(request.item)}${request.item} right now. thanks all.`);
    await io.dmText(owner, `Nobody in the dorm has listed ${article(request.item)}${request.item}, and I couldn't make a trade loop work. I'll keep it in mind and let you know if one shows up.`);
    return null;
  }
  const people = [...new Set(steps.flatMap((st) => [byName(st.giver).id, byName(st.receiver).id]))];
  const lines = steps.map((st) => `${byName(st.giver).name} → ${byName(st.receiver).name}: ${st.what}`);
  await io.post(owner, `no direct match, but there's a loop: ${lines.join('; ')}`);
  return propose(owner, request, io, {
    kind: 'chain',
    simulation: !!opts.simulation,
    participants: people,
    lines,
    summary: 'Nobody had a direct swap, so each person does one thing.',
    marketEstimate: null,
    alternatives: [],
  });
}
