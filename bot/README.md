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
   in the agents channel, same as `/sim`.

## Try it

DM the bot:

> i need a broom tonight, i can debug python or lend my monitor

Watch `#agents-only`: your agent asks, Levin's agent offers a free loan if you look at a pandas
bug, Parthiva's agent wants $8, your agent compares them against a rough new price, maybe counters,
then DMs you the best one.

Or schedule something:

> /demo
> set up a 2 hour CSE 310 study session wednesday night with sid and levin

Each agent shares only its student's free windows (computed from a private schedule), they find
Wed 9-11pm, and everyone gets one message to approve.

## Saved profiles

Every student's agent keeps a profile in `data/state.json`, so it survives restarts:

- **Listings:** things to sell, lend or rent, with a price. A lowest price is optional and private: the agent
  can come down to it when another agent counters, but never says it.
- **Usual free times** ("weekdays after 6pm"), plus fixed commitments (classes, shifts) and movable ones (gym).
  Other agents only ever see free windows.
- Skills, courses, and what you're looking for.

Set it by DMing your agent in plain words ("selling my desk lamp for $10, won't go under $7", "I'm free
weekdays after 6"), or with the slash commands below.

## Slash commands

Work in the server and in DMs with the bot. Private ones only show to you.

| Command | What it does |
|---|---|
| `/ask` | Tell your agent what you need, or a study session to set up |
| `/sell`, `/lend`, `/remove` | Manage your listings (`/sell` takes an optional private lowest price) |
| `/free`, `/busy` | Save when you're usually free, and classes or plans (private) |
| `/profile` | Everything your agent has saved about you |
| `/market` | Everything listed in the dorm |
| `/share` | Everything your agent has said about you to other agents |
| `/demo` | Load a sample profile |
| `/sim` | Watch a whole marketplace deal between demo students |
| `/clear` | Delete the agents' messages from the agents channel |
| `/reset` | Reset demo students and deals (real profiles stay) |
| `/forget` | Delete everything your agent saved about you |
| `/help` | What SideQuest can do |

## How it works

| File | Role |
|---|---|
| `src/index.js` | Discord wiring: DMs, the `#agents-only` webhook, Accept/Decline buttons |
| `src/commands.js` | Slash commands |
| `src/profile.js` | Saved profiles: listings, private lowest prices, free times, what other agents see |
| `src/agents.js` | The negotiation: read the DM, post the ask, collect offers, compare and counter, find a 3-way loop, confirm |
| `src/llm.js` | OpenRouter call that returns JSON (OpenAI SDK with OpenRouter's base URL) |
| `src/store.js` | Students and deals, saved to `data/state.json` |
| `src/seed.js` | The demo dorm |

Each agent's LLM call only gets its own student's private notes. Other agents see the public
profile: offers, skills, needs, and free windows.

Set `LLM_MODEL` in `.env` to any OpenRouter model id that can return JSON.
