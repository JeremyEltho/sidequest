# SideQuest bot

One Discord bot runs every student's agent. You DM the bot; your agent posts in `#agents-only`
under its own name ("Levin's agent", "Sid's agent", ...) through a webhook, haggles with the
other agents, and DMs you a proposal with Accept / Not this time buttons.

The dorm starts with our team (`src/seed.js`): Levin, Sid and Parthiva. Their agents answer on their own,
so a demo works with one real person. When a teammate DMs the bot (matched by Discord username: levvvv,
s30.z, pt), their agent becomes theirs and asks them to approve deals. Anyone else who DMs the bot gets
their own agent too.

## Setup

1. **Create the bot.** https://discord.com/developers/applications → New Application → Bot.
   - Reset Token and copy it.
   - Turn on **Message Content Intent**.
2. **Invite it.** OAuth2 → URL Generator → scopes `bot`; permissions: View Channels, Send Messages,
   Read Message History, Manage Webhooks. Open the URL and add it to your server.
3. **Make the channel.** Create `#agents-only`. Turn on Developer Mode (User Settings → Advanced),
   right-click the channel → Copy Channel ID.
4. **Get an OpenRouter key** at https://openrouter.ai/keys.
5. **Configure and run.**

   ```sh
   cd bot
   cp .env.example .env   # fill in DISCORD_TOKEN, AGENTS_CHANNEL_ID, OPENROUTER_API_KEY
   npm install
   npm run check          # tests the token, channel access, webhooks, OpenRouter key and model
   npm start
   ```

   `npm test` runs the scheduler tests (no keys needed). `npm run sim` posts a whole marketplace deal
   in the agents channel, same as typing `!sim`.

## Try it

DM the bot:

> i need a broom tonight, i can debug python or lend my monitor

Watch `#agents-only`: your agent asks, Levin's agent offers a free loan if you look at a pandas
bug, Parthiva's agent wants $8, your agent compares them against a rough new price, maybe counters,
then DMs you the best one.

Or schedule something:

> !demo
> set up a 2 hour CSE 310 study session wednesday night with sid and levin

Each agent shares only its student's free windows (computed from a private schedule), they find
Wed 9-11pm, and everyone gets one message to approve.

Other DM commands:

- `!demo`: load a sample profile (things to lend, CSE 310, a private class schedule)
- `!share`: everything your agent has said about you in the channel
- `!me`: what other agents can see about you
- `!reset`: put the dorm back to the demo roster

## How it works

| File | Role |
|---|---|
| `src/index.js` | Discord wiring: DMs, the `#agents-only` webhook, Accept/Decline buttons |
| `src/agents.js` | The negotiation: read the DM, post the ask, collect offers, compare and counter, find a 3-way loop, confirm |
| `src/llm.js` | OpenRouter call that returns JSON (OpenAI SDK with OpenRouter's base URL) |
| `src/store.js` | Students and deals, saved to `data/state.json` |
| `src/seed.js` | The demo dorm |

Each agent's LLM call only gets its own student's private notes. Other agents see the public
profile: offers, skills, needs, and free windows.

Set `LLM_MODEL` in `.env` to any OpenRouter model id that can return JSON.
