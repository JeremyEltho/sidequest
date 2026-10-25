# SideQuest demo script (with PT)

About 3 minutes. Two people, two phones. Jeremy runs the laptop (the `#agents-only` channel on screen). PT (Parthiva) has Discord open on his phone, because his agent is linked to his real account and he approves things himself.

## Before you start

- Laptop plugged in and awake, Do Not Disturb on, the bot running (`cd bot && npm start`), and `npm run check` passing.
- PT is next to you with Discord open on his phone.
- Run `/clear` so the agents channel is empty, then `/reset`, then `/demo` so your profile is clean.
- Everyone who gets a DM is a real person here. Don't run requests that include Levin unless Levin is also there.

## 1. The problem (10 seconds)

"Asking five group chats for a mini fridge or a study time is awkward. Every student gets an agent that does it for them."

## 2. Sell something in plain words, buy it from PT's phone (60 seconds)

**Jeremy**, in your DM with the bot:

> selling my macbook for $900, won't go below $700

The agent replies with a card:

- **Listed:** macbook, sell $900
- Your lowest price ($700) stays with the agent. Other agents only see $900.

Run `/market`. The MacBook shows at $900, and the $700 is nowhere.

**PT**, in his DM with the bot, on his phone:

> i want to buy a macbook

His agent asks: **"What's the most you'd pay for the macbook?"** and promises to keep the answer private. PT replies:

> 800

Watch `#agents-only`. PT's max never appears anywhere:

- PT's agent asks for a macbook, and your agent says $900.
- PT's agent opens **below** his max: "could you do $680?"
- Your agent knew its private lowest price ($700), so it meets in the middle: "best I can do is $790."
- PT's agent: "$790 could work for Parthiva. checking with them before anything is final."

You each get a DM at **$790** with **Accept** and **Not this time**. Don't accept yet.

**Jeremy**, in your DM, push for more:

> can u try 800

- Your agent asks PT's agent. $800 is within PT's private max, so it says yes. Neither of you is told the other's limit.
- You each get a **new** DM at **$800**, and the $790 one stops working. Both tap **Accept**. It locks.

For the other ending, say **"ok try 850 then"** instead: "sorry, $850 is more than Parthiva can do", and the $800 proposal stays open.

**Then set up the handoff.** The "It's on" DM already says what to do next. **Jeremy**, in your DM with the bot:

> when is pt free to hand off the macbook tomorrow

- Both agents post only free windows, and they land on a time: **Mon 1pm-1:30pm at Hayden Hall lobby**.
- You each get one DM. Both tap **Accept**. (Any of these works too: "ask pt when he can meet", "when is pt free".)

## 3. A study time with PT (45 seconds)

**Jeremy**, run `/ask`:

> 2 hour CSE 310 study session wednesday night with parthiva

- Each agent posts only its free windows. Nobody's classes or plans appear.
- They land on **Wed 6pm-8pm**. Both of you get one DM. Both tap **Accept**.

## 4. A conflict (30 seconds)

**Jeremy**, run `/ask`:

> study monday at 4pm with parthiva

- "Conflict": Parthiva has something fixed then. The agents never say what (it's a class).
- They move to the closest time that works for both: **Mon 5:30pm-7pm**.

Don't accept this one. The proposal just sits, which is fine.

## 5. A plan that moves (30 seconds)

**Jeremy**, run `/ask`:

> study monday at 12pm with parthiva

- Parthiva's gym slot is flexible, so his agent says "I can move something to make it work". It never says what.
- PT gets a private heads-up DM. The time stays **Mon 12pm-1:30pm**.
- Fixed things (a class) never move. Flexible things (the gym) can.

## 6. Privacy (15 seconds)

**Jeremy**: `/profile` (only you see it: your listings with your private lowest price and your commitments), then `/share` (everything your agent told other agents).

## What to say about Track 2

- **Conflicting constraints:** asking price vs. the buyer's private max vs. the seller's private lowest price, and fixed vs. flexible schedule blocks.
- **What they share:** listings and free windows. Never schedules or lowest prices.
- **When they confirm:** nothing happens until every person taps Accept. A pass is never announced.

## If something goes wrong

- Nothing posts: check the bot's terminal, run `/clear`, and try again.
- PT's phone is slow or he isn't there: run `/sim` (pick a scenario from the dropdown or `listing: macbook`). It needs no one else.
- Discord shows old commands: Cmd+R.
- Start over: `/reset`, then `/demo`.
- Backup: the "Watch it work" section on the site, or the YouTube demo video.
