import { interpretDM, applyProfileUpdates } from './agents.js';
import { runRequest } from './trade.js';
import { state } from './store.js';
import { normalizeOffer } from './profile.js';

// A marketplace deal between demo students, start to finish, with nobody typing.
// Sid wants a mini fridge with a $35 budget; Parthiva lists one at $45, so the agents haggle on price.
const DEFAULT_ASK = 'looking to buy a mini fridge for my room this week, cash only, my max is $35';

/**
 * runSim(io)                       the default fridge deal
 * runSim(io, "some request")       a request read from plain words (npm run sim "...")
 * runSim(io, { item, price, budget, lowest, seller })
 *   a sale you set up yourself: `seller` lists `item` at `price` (with an optional private `lowest`),
 *   Sid's agent shops for it with `budget`, and nobody else's listings compete.
 */
export async function runSim(io, input = DEFAULT_ASK) {
  // A simulation: every agent acts on its own and nobody gets DMs, even for teammates linked to real accounts.
  const buyer = state.students.find((s) => s.id === 'sid') ?? state.students[0];

  if (input && typeof input === 'object') {
    const seller = input.seller && input.seller.id !== buyer.id ? input.seller : state.students.find((s) => s.id !== buyer.id);
    const offer = normalizeOffer({ item: input.item, kind: 'sell', price: input.price, floor: input.lowest ?? null, terms: '' });
    if (!offer) throw new Error('A sale needs an item and an asking price.');
    const request = { item: input.item, details: '', neededBy: '', returnBy: null, maxBudget: input.budget ?? null, offering: [] };
    return runRequest(buyer, request, io, { simulation: true, onlyListings: [{ holder: seller, offer }] });
  }

  const r = await interpretDM(buyer, input);
  applyProfileUpdates(buyer, r);
  if (!r.request?.item) throw new Error(`Could not read a request from: ${input}`);
  return runRequest(buyer, r.request, io, { simulation: true });
}
