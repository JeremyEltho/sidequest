import { MessageFlags } from 'discord.js';
import { state, save, studentForUser, reset, forget, demoProfile } from './store.js';
import { applyProfileUpdates, describeProfile, marketText, removeOffer, normalizeOffer, offerText } from './profile.js';
import { runSim } from './sim.js';

// Usable in the server and in DMs with the bot.
const everywhere = { contexts: [0, 1], integration_types: [0] };
const STRING = 3;
const NUMBER = 10;

export const COMMANDS = [
  { name: 'ask', description: 'Tell your agent what you need, or a study session to set up', options: [
    { type: STRING, name: 'what', description: 'e.g. "need a broom tonight" or "study Wed night with Sid and Levin"', required: true },
  ] },
  { name: 'sell', description: 'List something for sale', options: [
    { type: STRING, name: 'item', description: 'What you are selling', required: true },
    { type: NUMBER, name: 'price', description: 'Asking price in dollars', required: true, min_value: 0 },
    { type: NUMBER, name: 'lowest', description: 'Lowest you would take (private, never shown)', min_value: 0 },
    { type: STRING, name: 'details', description: 'Condition, pickup, deadline...' },
  ] },
  { name: 'lend', description: 'List something you can lend', options: [
    { type: STRING, name: 'item', description: 'What you can lend', required: true },
    { type: STRING, name: 'details', description: 'e.g. "back the same night"' },
  ] },
  { name: 'remove', description: 'Take one of your listings down', options: [
    { type: STRING, name: 'item', description: 'Which listing', required: true, autocomplete: true },
  ] },
  { name: 'free', description: 'Save when you are usually free', options: [
    { type: STRING, name: 'when', description: 'e.g. "weekdays after 6pm, weekends after noon"', required: true },
  ] },
  { name: 'busy', description: 'Save a class, shift or plan (stays private)', options: [
    { type: STRING, name: 'what', description: 'e.g. "Orgo lab Tue/Thu 2-5pm" or "gym weekdays at noon, can move"', required: true },
  ] },
  { name: 'profile', description: 'See everything your agent has saved about you (only you see this)' },
  { name: 'market', description: 'Everything listed in the dorm' },
  { name: 'share', description: 'Everything your agent has said about you to other agents' },
  { name: 'demo', description: 'Load a sample profile with listings and a class schedule' },
  { name: 'sim', description: 'Watch a deal play out. Add an item to simulate your own sale.', options: [
    { type: STRING, name: 'item', description: 'What you are selling, e.g. macbook (leave empty for the default fridge deal)' },
    { type: NUMBER, name: 'price', description: 'Your asking price in dollars', min_value: 0 },
    { type: NUMBER, name: 'budget', description: "What the buyer (Sid's agent) can pay", min_value: 0 },
    { type: NUMBER, name: 'lowest', description: 'Your private lowest price (the buyer never sees it)', min_value: 0 },
  ] },
  { name: 'clear', description: 'Delete the agents\' messages from the agents channel' },
  { name: 'reset', description: 'Reset the demo students and deals (your profile stays)' },
  { name: 'forget', description: 'Delete everything your agent has saved about you' },
  { name: 'help', description: 'What SideQuest can do' },
].map((c) => ({ ...c, ...everywhere }));

export const HELP = [
  '**SideQuest**: your agent trades favors, sells your stuff and finds study times with other students\' agents.',
  '',
  '**Just DM me in plain words**, or use `/ask`:',
  '• "need a broom tonight, I can debug python": agents compare loans, prices and swaps',
  '• "2 hour CSE 310 study session wednesday night with sid and levin": agents find a time from free windows only',
  '',
  '**Your saved profile:**',
  '• `/sell`, `/lend`, `/remove`: your listings (a lowest price stays private)',
  '• `/free`: when you\'re usually free · `/busy`: classes and plans (private)',
  '• `/profile`: everything I\'ve saved · `/share`: what I\'ve told other agents · `/forget`: delete it all',
  '',
  '**Dorm:** `/market` what\'s for sale · `/sim` watch a deal (add item, price and budget to simulate your own sale) · `/demo` sample profile',
  '',
  'Nothing happens until everyone taps Accept.',
].join('\n');

const priv = (content) => ({ content: content.slice(0, 1990), flags: MessageFlags.Ephemeral });

/**
 * ctx: { io, handleText(owner, text, send), clearAgentsChannel(), interpretDM }
 */
export async function onCommand(i, ctx) {
  const owner = studentForUser(i.user);
  const opt = (name) => i.options.get(name)?.value;

  switch (i.commandName) {
    case 'help':
      return i.reply(priv(HELP));

    case 'profile':
      return i.reply(priv(describeProfile(owner)));

    case 'market':
      return i.reply({ content: marketText(state.students).slice(0, 1990) });

    case 'share': {
      const log = (owner.sharedLog || []).slice(-8).map((x) => `• ${x.text}`).join('\n') || '• nothing yet';
      return i.reply(priv(`What I've said about you to other agents lately:\n${log}\n\nNever shared: your lowest prices, your classes and plans, and why you're busy. Other agents only see your listings, skills, courses and free time.`));
    }

    case 'sell':
    case 'lend': {
      const o = normalizeOffer({
        item: opt('item'),
        kind: i.commandName,
        price: i.commandName === 'sell' ? opt('price') : null,
        floor: opt('lowest') ?? null,
        terms: opt('details') ?? '',
      });
      applyProfileUpdates(owner, { addOffers: [o] });
      return i.reply(priv(`Listed: ${offerText(o, { withFloor: true })}.\nOther agents see the listing, never your lowest price. \`/market\` shows the whole dorm.`));
    }

    case 'remove': {
      const n = removeOffer(owner, opt('item'));
      return i.reply(priv(n ? `Took down "${opt('item')}".` : `You don't have a listing called "${opt('item')}". \`/profile\` shows them.`));
    }

    case 'free':
    case 'busy': {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const said = i.commandName === 'free' ? `I'm usually free ${opt('when')}` : `Save this commitment: ${opt('what')}`;
      const r = await ctx.interpretDM(owner, said);
      applyProfileUpdates(owner, { setFree: r.setFree, addBusy: r.addBusy, privateNotes: r.privateNotes });
      return i.editReply(`Saved. Here's your week as I see it:\n\n${describeProfile(owner).split('\n\n')[1]}`);
    }

    case 'ask': {
      await i.reply(priv("On it. I'll keep you posted in DMs, and the agents channel shows the negotiation."));
      const dm = await i.user.createDM();
      return ctx.handleText(owner, opt('what'), (t) => dm.send(t));
    }

    case 'demo':
      demoProfile(owner);
      return i.reply(priv(`Loaded a sample profile:\n\n${describeProfile(owner)}\n\nTry \`/ask\` "2 hour CSE 310 study session wednesday night with sid and levin".`));

    case 'sim': {
      const item = opt('item');
      if (item && (opt('price') == null || opt('budget') == null)) {
        return i.reply(priv('To simulate a sale I need the item, your asking price and the buyer\'s budget, like `/sim item:macbook price:900 budget:750`. Add `lowest` for your private floor.'));
      }
      await i.reply(item ? `Simulating ${owner.name}'s ${item} sale in the agents channel 👀` : 'Running a marketplace deal in the agents channel 👀');
      const input = item ? { item, price: opt('price'), budget: opt('budget'), lowest: opt('lowest'), seller: owner } : undefined;
      return runSim(ctx.io, input).catch((err) => console.error(err));
    }

    case 'clear': {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const n = await ctx.clearAgentsChannel();
      return i.editReply(`Cleared ${n} agent messages.`);
    }

    case 'reset':
      reset();
      return i.reply(priv('Demo students and deals are back to the start. Your saved profile is still here.'));

    case 'forget':
      forget(owner);
      save();
      return i.reply(priv('Deleted everything I had saved about you. Tell me about yourself again anytime.'));
  }
}

export async function onAutocomplete(i) {
  const owner = studentForUser(i.user);
  const typed = String(i.options.getFocused() || '').toLowerCase();
  const choices = (owner.offers || [])
    .filter((o) => o.item.toLowerCase().includes(typed))
    .slice(0, 25)
    .map((o) => ({ name: o.item.slice(0, 100), value: o.item.slice(0, 100) }));
  return i.respond(choices);
}
