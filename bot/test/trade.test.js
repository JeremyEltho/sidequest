import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanItem } from '../src/trade.js';

const names = ['Levin', 'Sid', 'Parthiva', 'Jeremy'];

test('a seller\'s name is stripped from the item', () => {
  assert.equal(cleanItem('parthivas speaker', names), 'speaker');
  assert.equal(cleanItem("Parthiva's speaker", names), 'speaker');
  assert.equal(cleanItem('the speaker from Parthiva', names), 'speaker');
  assert.equal(cleanItem("levin's desk lamp", names), 'desk lamp');
});

test('ordinary items are left alone', () => {
  assert.equal(cleanItem('mini fridge', names), 'mini fridge');
  assert.equal(cleanItem('macbook', names), 'macbook');
  assert.equal(cleanItem('sidewalk chalk', names), 'sidewalk chalk');
  assert.equal(cleanItem('', names), '');
});

test('nicknames find the right student', async () => {
  const { byName } = await import('../src/store.js');
  assert.equal(byName('pt')?.id, 'parthiva');
  assert.equal(byName('PT')?.id, 'parthiva');
  assert.equal(byName("Parthiva's agent")?.id, 'parthiva');
  assert.equal(byName('nobody'), undefined);
});

test('a buyer with a private max haggles up from below it', async () => {
  const { planHaggle } = await import('../src/trade.js');
  // max $800, seller asks $900 and would take $700: opens at $680, meets at $790
  const a = planHaggle({ asking: 900, floor: 700, max: 800 });
  assert.equal(a.price, 790); assert.equal(a.deal, true);
  assert.deepEqual(a.steps.map((x) => x.by + ':' + Object.keys(x)[1]), ['buyer:ask', 'seller:counter', 'buyer:accept']);
  // max $750: the midpoint ($770) is over it, so the buyer's last offer is the max, which clears the floor
  const b = planHaggle({ asking: 900, floor: 700, max: 750 });
  assert.equal(b.price, 750); assert.equal(b.deal, true);
  assert.ok(b.steps.some((x) => x.last === 750));
  // max below the seller's floor: no deal
  assert.equal(planHaggle({ asking: 900, floor: 700, max: 650 }).deal, false);
  // no floor set means the asking price is firm
  assert.equal(planHaggle({ asking: 900, floor: null, max: 800 }).deal, false);
  // plenty of room: no haggling at all
  assert.deepEqual(planHaggle({ asking: 900, floor: 700, max: 2000 }), { price: 900, steps: [], deal: true });
});

test('demo simulations open at the max, one round, like the scripted deals', async () => {
  const { planHaggle } = await import('../src/trade.js');
  assert.equal(planHaggle({ asking: 900, floor: 700, max: 750, openAtMax: true }).price, 750);
  assert.equal(planHaggle({ asking: 900, floor: 800, max: 750, openAtMax: true }).price, 825);
  assert.equal(planHaggle({ asking: 900, floor: null, max: 750, openAtMax: true }).price, 900);
});
