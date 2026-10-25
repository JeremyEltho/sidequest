import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials, Events, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
} from 'discord.js';
import { state, save, studentForUser, reset, logShared, demoProfile } from './store.js';
import { interpretDM, applyProfileUpdates, runRequest, approve, decline } from './agents.js';
import { runMeetup } from './meetup.js';
import { runSim } from './sim.js';
import { MODEL } from './llm.js';

for (const key of ['DISCORD_TOKEN', 'AGENTS_CHANNEL_ID', 'OPENROUTER_API_KEY']) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Copy .env.example to .env and fill it in.`);
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
    await agentsHook();
    console.log('Posting to #agents-only through a webhook.');
  } catch (err) {
    console.error('Could not set up the #agents-only webhook. Does the bot have Manage Webhooks there?', err.message);
  }
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;
  const isDM = msg.channel.type === ChannelType.DM;
  let text = msg.content.trim();
  if (/^!sim\b/i.test(text)) {
    // Public demo: a whole marketplace deal between demo students, played out in the agents channel.
    await msg.reply('Running a marketplace deal in the agents channel 👀').catch(() => {});
    return runSim(io, text.replace(/^!sim\s*/i, '') || undefined).catch((err) => console.error(err));
  }
  if (/^!help$/i.test(text)) {
    return msg.reply([
      '**SideQuest**: your agent trades favors and finds times with other students\' agents.',
      '',
      '**Just text me what you want:**',
      '• `i need a broom tonight, i can debug python`: agents compare loans, prices and swaps',
      '• `2 hour CSE 310 study session wednesday night with sid and levin`: agents find a time from free windows only',
      '• `i can lend my monitor` or `i have lab tue/thu 2-5pm`: I remember it (schedules stay private)',
      '',
      '**Commands:**',
      '• `!demo`: load a sample profile with a class schedule',
      '• `!me`: what other agents can see about you',
      '• `!share`: everything I\'ve said about you to other agents',
      '• `!sim`: watch a whole marketplace deal between demo students',
      '• `!clear`: wipe agent messages from the agents channel',
      '• `!reset`: start the dorm over',
      '',
      'Nothing happens until everyone taps Accept.',
    ].join('\n'));
  }
  if (/^!clear$/i.test(text)) {
    // Reset the agents channel between demos: removes what the bot and its agents posted, nothing else.
    const n = await clearAgentsChannel();
    if (isDM) return msg.reply(`Cleared ${n} agent messages from the agents channel.`);
    return msg.delete().catch(() => {});
  }
  if (!isDM) {
    // In a server channel, only react to a !command or an @mention, and move the conversation to DMs
    // so nobody's private details end up in the channel.
    const mentioned = msg.mentions.users.has(client.user.id);
    if (!mentioned && !text.startsWith('!')) return;
    text = text.replace(/<@!?\d+>/g, '').trim();
    if (!text) return;
    await msg.reply("I'll take this to your DMs so your details stay private. 👋").catch(() => {});
  }
  const owner = studentForUser(msg.author);
  const dm = isDM ? msg.channel : await msg.author.createDM();
  msg = { reply: (t) => dm.send(t), channel: dm };

  if (/^!reset$/i.test(text)) {
    reset();
    return msg.reply('Reset the dorm to the demo roster. Your profile starts fresh.');
  }
  if (/^!(me|profile)$/i.test(text)) {
    const o = owner.offers.map((x) => `• ${x.item} (${x.terms})`).join('\n') || '• nothing yet';
    return msg.reply(`What other agents can see about you:\n**Offers**\n${o}\n**Skills:** ${owner.skills.join(', ') || 'none yet'}\n**Free:** ${owner.availability}\n\nPrivate notes I keep to myself: ${owner.privateNotes.length}`);
  }
  if (/^!demo$/i.test(text)) {
    demoProfile(owner);
    return msg.reply('Loaded a demo profile: you can lend a USB-C charger and a monitor, you debug Python, you take CSE 310, and I know your class and work schedule (that stays with me). Try: "set up a CSE 310 study session this week" or "i need a tripod tonight".');
  }
  if (/^!share$/i.test(text)) {
    const log = (owner.sharedLog || []).slice(-8).map((x) => `• ${x.text}`).join('\n') || '• nothing yet';
    return msg.reply(`Everything I've said about you in #agents-only lately:\n${log}\n\nKept private: ${owner.privateNotes.length} notes (classes, shifts, limits). Other agents only ever see your offers, skills, courses, and free windows.`);
  }
  if (busy.has(owner.id)) return msg.reply("Still working on your last ask, give me a sec.");

  busy.add(owner.id);
  try {
    await msg.channel.sendTyping();
    const r = await interpretDM(owner, text);
    applyProfileUpdates(owner, r);
    if (r.reply) await msg.reply(r.reply);
    if (r.intent === 'request' && r.request?.item) {
      owner.needs = [...new Set([...owner.needs, r.request.item])];
      save();
      await runRequest(owner, r.request, io);
    } else if (r.intent === 'meetup' && r.meetup) {
      await runMeetup(owner, r.meetup, io);
    }
  } catch (err) {
    console.error(err);
    await msg.reply('Something broke on my end talking to the other agents. Try again in a minute.');
  } finally {
    busy.delete(owner.id);
  }
});

client.on(Events.InteractionCreate, async (i) => {
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
