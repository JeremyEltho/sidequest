import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials, Events, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
} from 'discord.js';
import { state, save, studentForUser, logShared } from './store.js';
import { interpretDM, applyProfileUpdates, approve, decline } from './agents.js';
import { runRequest, needsMax, counterDeal } from './trade.js';
import { runMeetup } from './meetup.js';
import { WELCOME, normalizeOffer, offerText, publicOffer } from './profile.js';
import { COMMANDS, onCommand, onAutocomplete } from './commands.js';
import { MODEL } from './llm.js';

for (const key of ['DISCORD_TOKEN', 'AGENTS_CHANNEL_ID', 'OPENROUTER_API_KEY']) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Copy .env.example to .env and fill it in, then run npm run check.`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const CLAY = 0xd97757;
const busy = new Set();
let hook;

const avatar = (s) =>
  `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(s.name)}&backgroundColor=${s.color || 'D97757'}`;

async function agentsHook() {
  if (hook) return hook;
  const channel = await client.channels.fetch(process.env.AGENTS_CHANNEL_ID);
  const hooks = await channel.fetchWebhooks();
  hook = hooks.find((h) => h.owner?.id === client.user.id) ?? (await channel.createWebhook({ name: 'SideQuest agents' }));
  return hook;
}

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const REMIND_BEFORE_MIN = 30;

/** Next time this weekday-and-minute comes around, as a Date. */
function nextOccurrence(day, minute) {
  const now = new Date();
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + ((DAY_INDEX[day] - now.getDay() + 7) % 7));
  t.setMinutes(minute);
  if (t <= now) t.setDate(t.getDate() + 7);
  return t;
}

// Everything the negotiation needs to talk to Discord.
const io = {
  // DM everyone in a locked study session shortly before it starts.
  // Reminders live in memory, so they're lost if the bot restarts.
  remind(deal) {
    if (!deal.slot) return;
    const start = nextOccurrence(deal.slot.day, deal.slot.start);
    const wait = start - Date.now() - REMIND_BEFORE_MIN * 60_000;
    if (wait < 0) return;
    setTimeout(() => {
      for (const id of deal.participants) {
        const s = state.students.find((x) => x.id === id);
        io.dmText(s, `⏰ ${deal.request?.topic ?? 'Your session'} starts in ${REMIND_BEFORE_MIN} minutes at ${deal.slot.place}.`).catch(() => {});
      }
    }, wait);
    console.log(`Reminder set for deal ${deal.id}: ${start.toString()}`);
  },
  async post(s, text) {
    if (!text) return;
    const h = await agentsHook();
    await h.send({ content: text.slice(0, 1900), username: `${s.name}'s agent`, avatarURL: avatar(s) });
    logShared(s, text);
  },
  async dmText(s, text) {
    if (s.simulated || !s.discordId) return;
    const user = await client.users.fetch(s.discordId);
    await user.send(text.slice(0, 1900));
  },
  async dmProposal(s, deal) {
    if (s.simulated || !s.discordId) return;
    const others = deal.participants
      .map((id) => state.students.find((x) => x.id === id))
      .filter((p) => p.id !== s.id)
      .map((p) => `${p.name}: ${deal.approvals[p.id] === 'yes' ? 'said yes' : 'waiting'}`);

    const embed = new EmbedBuilder()
      .setColor(CLAY)
      .setTitle(
        deal.kind === 'chain' ? 'Found a trade loop'
          : deal.kind === 'meetup' ? `Found a time: ${deal.request?.topic ?? 'meetup'}`
            : `Found you a ${deal.request?.item ?? 'deal'}`,
      )
      .setDescription(deal.lines.map((l) => `• ${l}`).join('\n'))
      .setFooter({ text: 'Everyone has to say yes before anything happens.' });
    if (deal.summary) embed.addFields({ name: 'Why this one', value: deal.summary.slice(0, 1000) });
    if (deal.marketEstimate) embed.addFields({ name: 'Price check', value: deal.marketEstimate.slice(0, 1000) });
    if (others.length) embed.addFields({ name: 'Others', value: others.join('\n') });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`yes:${deal.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`no:${deal.id}`).setLabel('Not this time').setStyle(ButtonStyle.Secondary),
    );
    const user = await client.users.fetch(s.discordId);
    await user.send({ embeds: [embed], components: [row] });
  },
};

async function clearAgentsChannel() {
  const h = await agentsHook();
  const channel = await client.channels.fetch(process.env.AGENTS_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 100 });
  let n = 0;
  for (const m of messages.values()) {
    try {
      if (m.webhookId === h.id) await h.deleteMessage(m.id);
      else if (m.author.id === client.user.id) await m.delete();
      else continue;
      n++;
    } catch (err) {
      console.error('could not delete', m.id, err.message);
    }
  }
  return n;
}

client.once(Events.ClientReady, async (c) => {
  console.log(`SideQuest is online as ${c.user.tag} (model: ${MODEL})`);
  try {
    await c.application.commands.set(COMMANDS);
    console.log(`Registered ${COMMANDS.length} slash commands.`);
  } catch (err) {
    console.error('Could not register slash commands:', err.message);
  }
  try {
    await agentsHook();
    console.log('Posting to #agents-only through a webhook.');
  } catch (err) {
    console.error('Could not set up the #agents-only webhook. Does the bot have Manage Webhooks there?', err.message);
  }
});

/** Everything a student says to their agent in plain words, from a DM or /ask. */
// People who asked for something that's for sale and haven't said their max yet: id -> the request.
const awaitingMax = new Map();

/** The deal (if any) that is waiting on this person's answer, so "can u try 800" can mean that deal. */
function waitingDealFor(owner) {
  return Object.values(state.deals)
    .filter((d) => d.status === 'proposed' && d.price != null && d.approvals?.[owner.id] === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}

async function handleText(owner, text, send) {
  if (busy.has(owner.id)) return send("Still working on your last ask, give me a sec.");
  busy.add(owner.id);
  try {
    // Their agent asked "what's the most you'd pay?" and this is the answer.
    const pending = awaitingMax.get(owner.id);
    if (pending) {
      awaitingMax.delete(owner.id);
      const n = Number((text.match(/\$?\s*(\d[\d,]*(?:\.\d+)?)/) || [])[1]?.replace(/,/g, ''));
      if (n > 0) {
        await send(`Got it. I'll start lower and keep your max of $${n} to myself.`);
        owner.needs = [...new Set([...owner.needs, pending.item])];
        save();
        await runRequest(owner, { ...pending, maxBudget: n }, io);
        return;
      }
      // Not a number: treat it as a fresh message.
    }
    const waiting = waitingDealFor(owner);
    const r = await interpretDM(owner, text, new Date(), waiting ? waiting.lines[0] : '');
    if (r.intent === 'counter') {
      if (!waiting) return send("There's no deal waiting on you right now. If you meant to change a listing price, say which item.");
      await counterDeal(waiting, owner, Number(r.counter?.price), io, send);
      return;
    }
    // Asking for something never rewrites your week: only an "update" can change free times or commitments.
    // A request can still add what you offer in return ("I can debug Python").
    if (r.intent === 'request' || r.intent === 'meetup') {
      delete r.setFree; delete r.addBusy; delete r.clearBusy; delete r.removeOffers;
    }
    applyProfileUpdates(owner, r);
    // Asking for something that's for sale, with no max given: ask for it first, privately.
    if (r.intent === 'request' && r.request?.item) {
      const ask = await needsMax(owner, r.request);
      if (ask) {
        awaitingMax.set(owner.id, r.request);
        await send(`What's the most you'd pay for the ${ask.item}? The best listing is $${ask.asking}. I'll keep your max private and try to pay less.`);
        return;
      }
    }
    if (r.reply) await send(r.reply);
    // Listing something in plain words: show exactly what was saved, and what everyone else will see.
    const listed = (r.addOffers || []).map(normalizeOffer).filter((o) => o && o.price != null);
    for (const o of listed) {
      await send([
        `✅ **Listed:** ${offerText(publicOffer(o))}`,
        o.floor != null ? `🔒 Your lowest price ($${o.floor}) stays with me. Other agents only see $${o.price}.` : `Other agents see it at $${o.price}. Tell me a lowest price if you'd come down, and I'll keep it private.`,
        `Next: \`/market\` shows it to the dorm, or \`/sim listing:${o.item}\` to watch a buyer haggle for it.`,
      ].join('\n'));
    }
    if (r.intent === 'request' && r.request?.item) {
      owner.needs = [...new Set([...owner.needs, r.request.item])];
      save();
      await runRequest(owner, r.request, io);
    } else if (r.intent === 'meetup' && r.meetup) {
      await runMeetup(owner, r.meetup, io, text);
    }
  } catch (err) {
    console.error(err);
    await send('Something broke on my end talking to the other agents. Try again in a minute.');
  } finally {
    busy.delete(owner.id);
  }
}

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;
  const isDM = msg.channel.type === ChannelType.DM;
  let text = msg.content.trim();
  if (!isDM) {
    // In a server channel, only an @mention gets a response, and the conversation moves to DMs
    // so nobody's private details end up in the channel.
    if (!msg.mentions.users.has(client.user.id)) return;
    text = text.replace(/<@!?\d+>/g, '').trim();
    if (!text) return;
    await msg.reply("I'll take this to your DMs so your details stay private. 👋").catch(() => {});
  }
  const owner = studentForUser(msg.author);
  const dm = isDM ? msg.channel : await msg.author.createDM();
  if (!owner.welcomed) {
    owner.welcomed = true;
    save();
    await dm.send(WELCOME);
  }
  await dm.sendTyping().catch(() => {});
  await handleText(owner, text, (t) => dm.send(t));
});

client.on(Events.InteractionCreate, async (i) => {
  if (i.isAutocomplete()) return onAutocomplete(i).catch(() => {});
  if (i.isChatInputCommand()) {
    return onCommand(i, { io, handleText, clearAgentsChannel, interpretDM }).catch((err) => {
      console.error(err);
      const msg = { content: 'Something went wrong with that command.', flags: MessageFlags.Ephemeral };
      return (i.deferred || i.replied ? i.followUp(msg) : i.reply(msg)).catch(() => {});
    });
  }
  if (!i.isButton()) return;
  const [choice, dealId] = i.customId.split(':');
  const deal = state.deals[dealId];
  const s = studentForUser(i.user);

  if (!deal || deal.status !== 'proposed' || !(s.id in deal.approvals)) {
    return i.reply({ content: 'That proposal is no longer open.', flags: MessageFlags.Ephemeral });
  }
  await i.update({ components: [] });
  await i.followUp(choice === 'yes' ? 'Accepted.' : "Passed. Nobody's told you passed; looking for something else.");
  try {
    if (choice === 'yes') await approve(deal, s, io);
    else await decline(deal, s, io);
  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.DISCORD_TOKEN);
