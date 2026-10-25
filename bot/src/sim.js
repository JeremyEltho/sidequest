import { interpretDM, applyProfileUpdates, runRequest } from './agents.js';
import { state } from './store.js';

// A marketplace deal between demo students, start to finish, with nobody typing.
// Sid needs a broom and can offer a tripod or photo editing; the other agents bid and haggle.
const DEFAULT_ASK = 'need a broom tonight to clean up after a shoot. budget is about $6, can also lend my tripod or edit photos';

export async function runSim(io, text = DEFAULT_ASK) {
  const buyer = state.students.find((s) => s.id === 'sid' && s.simulated)
    ?? state.students.find((s) => s.simulated);
  if (!buyer) throw new Error('Every demo student is linked to a real person; nobody left to simulate.');
  const r = await interpretDM(buyer, text);
  applyProfileUpdates(buyer, r);
  if (!r.request?.item) throw new Error(`Could not read a request from: ${text}`);
  return runRequest(buyer, r.request, io);
}
