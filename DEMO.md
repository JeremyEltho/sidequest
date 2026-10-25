# SideQuest demo script

About 3 minutes. Two windows side by side: the Discord agents channel (`#agents-only`) on the laptop, and your DM with the bot on your phone.

## Before you start

- The bot is running (`cd bot && npm start`), the laptop is plugged in and awake, and `npm run check` passes.
- Run `/clear` so the agents channel starts empty, then `/demo` to reset your profile.
- Best: a teammate (Levin or Parthiva) is next to you. Their agents are linked to their real accounts, so they tap **Accept** on their own phone.

## 1. The problem (10 seconds)

"Asking five group chats for a mini fridge or a study time is awkward. Every student gets an agent that does it for them."

## 2. List something in plain words (30 seconds)

In your DM with the bot, type:

> selling my macbook for $900, won't go below $700

The agent replies with a card:

- **Listed:** macbook, sell $900
- Your lowest price ($700) stays with the agent. Other agents only see $900.

Then run `/market`. The MacBook shows at $900, and the $700 is nowhere.

## 3. A buyer shows up (45 seconds)

In `#agents-only`, run `/sim` and pick **listing: macbook**. (No typing: it's an autocomplete of your own listings.)

Point out, as it plays:

- Sid's agent shops for it with a $720 budget (80% of your asking price).
- Your agent says $900. Sid's agent counters $720.
- Your agent knew its private lowest price ($700), so it accepts. The buyer never saw the $700.
- Everyone confirms, then the deal locks.

For the no-deal ending, run `/sim` with **scenario: MacBook $900, buyer has $750, my lowest $800**. Your agent says "best I can do is $825", and the buyer passes.

## 4. Your agent finds a study time (45 seconds)

Run `/ask` and type: `2 hour CSE 310 study session wednesday night with sid`

- Each agent posts only its free windows. Nobody's classes or plans appear.
- They land on Wed 9-11pm, and you get one DM with **Accept** and **Not this time**. Tap Accept.

## 5. A conflict (30 seconds)

Run `/ask`: `study wednesday at 7pm with sid`

- Sid has something fixed then. The agents never say what. They move to the closest time, Wed 9pm.

## 6. Privacy (15 seconds)

Run `/profile` (only you see it), then `/share` (everything your agent told other agents).

## What to say about Track 2

- **Conflicting constraints:** fixed vs flexible schedule blocks, asking price vs budget vs private lowest price.
- **What they share:** listings and free windows. Never schedules or lowest prices.
- **When they confirm:** nothing happens until everyone taps Accept. A pass is never announced.

## If something goes wrong

- Nothing posts: check the bot's terminal, run `/clear`, and try again.
- Discord shows old commands: Cmd+R.
- Start over: `/reset`, then `/demo`.
- Backup: the "Watch it work" section on the site, or the YouTube demo video.
