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
