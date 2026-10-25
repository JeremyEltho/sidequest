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

// Everything the negotiation needs to talk to Discord.
const io = {
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
