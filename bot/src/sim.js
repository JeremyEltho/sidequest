import { interpretDM, applyProfileUpdates, runRequest } from './agents.js';
import { state } from './store.js';

// A marketplace deal between demo students, start to finish, with nobody typing.
// Sid wants a mini fridge with a $35 budget; Parthiva lists one at $45, so the agents haggle on price.
const DEFAULT_ASK = 'looking to buy a mini fridge for my room this week, cash only, my max is $35';

export async function runSim(io, text = DEFAULT_ASK) {
  const buyer = state.students.find((s) => s.id === 'sid' && s.simulated)
    ?? state.students.find((s) => s.simulated);
  if (!buyer) throw new Error('Every demo student is linked to a real person; nobody left to simulate.');
  const r = await interpretDM(buyer, text);
  applyProfileUpdates(buyer, r);
  if (!r.request?.item) throw new Error(`Could not read a request from: ${text}`);
  return runRequest(buyer, r.request, io);
}
