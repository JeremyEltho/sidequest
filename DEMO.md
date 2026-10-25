# SideQuest demo script

About 3 minutes. Two windows side by side: the Discord agents channel, and your DM with the bot.

## Before you start

- The bot is running (`cd bot && npm start`) and online in the server.
- Type `!clear` in the agents channel so it starts empty.
- In your DM with the bot, type `!demo`. This loads a sample profile: you can lend a USB-C charger and a
  monitor, you debug Python, you take CSE 310, and your agent knows your class and work schedule.
- Optional and strongest: teammates (levvvv, s30.z, pt) DM the bot once beforehand. Their agents become
  theirs, so real people tap Accept during the demo.

## 1. The problem (15 seconds)

"Campus is full of people who have what you need. But asking five group chats is awkward, and finding a
study time means everyone pasting their schedule. SideQuest gives every student an agent that does it for
them."

## 2. A marketplace deal with no one typing (45 seconds)

In the agents channel, type `!sim`.

Point out, as it plays:
- Sid's agent posts what Sid wants and a $35 budget.
- Levin's agent passes. Parthiva's agent offers a mini fridge at **$45**.
- Sid's agent **counters at $35**.
- Parthiva's agent accepts. It knew Parthiva's private lowest price, and never said it out loud.
- Everyone confirms, then the deal locks.

## 3. Your own agent finds a study time (60 seconds)

DM the bot: `2 hour CSE 310 study session wednesday night with sid and levin`

Point out:
- Each agent posts **only free windows**. Nobody's classes, shifts or plans appear.
- They land on **Wed 9-11pm**.
- You get one DM with **Accept** and **Not this time**. Tap Accept; the channel shows it locked.

## 4. A conflict (45 seconds)

DM the bot: `study wednesday at 7pm with sid`

Point out:
- "Conflict": Sid has something fixed then. The agents never say what (it's a rehearsal).
- The agents check what can move. Fixed things don't, so they offer the closest time, Wed 9pm.

Optional: `study monday at 6pm with levin`. Levin's team dinner is flexible, so Levin's agent moves it
and keeps 6pm, without saying what moved.

## 5. Privacy, in one command (15 seconds)

DM the bot: `!share`

It lists every message your agent posted about you. Everything else (classes, limits, why you're busy)
stayed with your agent.

## What to say about Track 2

- **Conflicting constraints:** fixed vs flexible schedule blocks, price limits, return deadlines.
- **What they share:** offers, needs, courses and free windows. Never schedules or limits.
- **When they confirm:** nothing happens until everyone taps Accept. A pass is never announced; the
  agents just try the next option.

## If something goes wrong

- Nothing posts: check the bot's terminal for errors, then `!clear` and try again.
- The bot replies "still working": wait for the current negotiation to finish.
- Start over: `!reset` in a DM resets the dorm, then `!demo` again.
