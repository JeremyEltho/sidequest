// `npm run sim`: post a full simulated marketplace deal in the agents channel,
// using the bot's webhook directly (works while the bot itself is running).
import 'dotenv/config';
import { REST, Routes, WebhookClient } from 'discord.js';
import { runSim } from './sim.js';
import { logShared } from './store.js';

const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const channelId = process.env.AGENTS_CHANNEL_ID;
const me = await rest.get(Routes.user());
const hooks = await rest.get(Routes.channelWebhooks(channelId));
const found = hooks.find((h) => h.user?.id === me.id && h.token)
  ?? await rest.post(Routes.channelWebhooks(channelId), { body: { name: 'SideQuest agents' } });
const hook = new WebhookClient({ id: found.id, token: found.token });

const avatar = (s) => `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(s.name)}&backgroundColor=${s.color || 'D97757'}`;
const io = {
  async post(s, text) {
    if (!text) return;
    await hook.send({ content: text.slice(0, 1900), username: `${s.name}'s agent`, avatarURL: avatar(s) });
    logShared(s, text);
    console.log(`[${s.name}'s agent] ${text}`);
  },
  async dmText() {},
  async dmProposal() {},
};

await runSim(io, process.argv.slice(2).join(' ') || undefined);
hook.destroy();
