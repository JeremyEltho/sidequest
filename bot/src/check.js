// `npm run check`: make sure everything the bot needs works, before a demo.
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const HELP = {
  DISCORD_TOKEN: 'Discord developer portal → your app → Bot → Reset Token',
  AGENTS_CHANNEL_ID: 'Discord → turn on Developer Mode → right-click the agents channel → Copy Channel ID',
  OPENROUTER_API_KEY: 'https://openrouter.ai/keys',
};

let failed = 0;
const ok = (msg) => console.log(`✔ ${msg}`);
const bad = (msg, fix) => {
  failed++;
  console.log(`✘ ${msg}${fix ? `\n    fix: ${fix}` : ''}`);
};

for (const [key, where] of Object.entries(HELP)) {
  if (process.env[key]) ok(`${key} is set`);
  else bad(`${key} is missing in bot/.env`, where);
}

if (process.env.DISCORD_TOKEN) {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  try {
    const me = await rest.get(Routes.user());
    ok(`Discord token works (bot: ${me.username})`);
    const app = await rest.get(Routes.currentApplication());
    // Message Content is flag 1 << 19 (verified bots) or 1 << 18 (limited, unverified bots).
    if (app.flags & ((1 << 18) | (1 << 19))) ok('Message Content Intent is on');
    else bad('Message Content Intent is off', 'Developer portal → Bot → Privileged Gateway Intents → Message Content Intent → Save');
    if (process.env.AGENTS_CHANNEL_ID) {
      try {
        const ch = await rest.get(Routes.channel(process.env.AGENTS_CHANNEL_ID));
        ok(`can see the agents channel (#${ch.name})`);
        try {
          await rest.get(Routes.channelWebhooks(process.env.AGENTS_CHANNEL_ID));
          ok('can post as agents (Manage Webhooks)');
        } catch {
          bad('missing Manage Webhooks in that channel', 'Re-invite with the "Add to Discord" link on the site, or give the bot Manage Webhooks in the channel settings');
        }
      } catch {
        bad("can't see the agents channel", 'Invite the bot to that server, and if the channel is private, add the bot to it');
      }
    }
  } catch {
    bad('Discord token was rejected', HELP.DISCORD_TOKEN);
  }
}

if (process.env.OPENROUTER_API_KEY) {
  const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
  }).catch(() => null);
  if (res?.ok) ok('OpenRouter key works');
  else bad(`OpenRouter key was rejected${res ? ` (HTTP ${res.status})` : ''}`, HELP.OPENROUTER_API_KEY);

  const model = process.env.LLM_MODEL || 'openai/gpt-4o-mini';
  const models = await fetch('https://openrouter.ai/api/v1/models').then((r) => r.json()).catch(() => null);
  if (!models) bad("couldn't reach OpenRouter to check the model");
  else if (models.data?.some((m) => m.id === model)) ok(`model ${model} exists`);
  else bad(`model ${model} isn't on OpenRouter`, 'Set LLM_MODEL in bot/.env to an id from https://openrouter.ai/models');
}

console.log(failed ? `\n${failed} problem${failed > 1 ? 's' : ''} to fix.` : '\nAll good. Start the bot with npm start.');
process.exit(failed ? 1 : 0);
