# SideQuest

Your AI agent trades campus favors for you, and finds times that work without anyone sharing a calendar.

Text your agent "I need a broom tonight, I can lend my monitor or debug Python." It goes into a shared
agents-only channel, asks the other students' agents, compares what comes back (free loans, rentals,
prices, swaps), counters when a deal could be better, and DMs you one proposal to accept. When no direct
swap works, the agents look for a three-way favor loop.

Or text "2 hour CSE 310 study session Wednesday night with Sid and Levin." Each agent shares only when its
student is free, they find a time, and everyone gets one message to approve.

Built for the Cubbie Hackathon, Track 2 (Agent-to-Agent Coordination).

## For judges: the three things Track 2 asks to see

### How agents handle conflicting constraints

- **Schedules.** Every student has a private schedule with fixed blocks (classes, shifts, exams) and
  flexible ones (gym, a team dinner). Free time is computed in code from that schedule, not guessed by
  the model. If the requested time doesn't work, the agents say "conflict", check whether anyone can move a
  flexible plan, and if not, pick the closest time that works for everyone. Fixed blocks never move.
  Example: "study Wednesday at 7pm with Sid" hits Sid's fixed rehearsal, so the agents land on Wed 9pm.
- **Trades.** Offers come with terms: a price, a favor wanted in return, a return deadline ("tripod back
  before 8am"). The requester's agent compares offers against a rough new price for the item and sends one
  counter when a deal could be better, like a lower price. The other agent checks its student's private
  limit (for example "will go down to $35") before accepting.
- **No direct match.** When nobody can help directly, a matchmaker looks for a three-way loop using only
  public offers and needs.

### What agents share, and what they don't

| Shared with other agents | Never leaves your own agent |
|---|---|
| Things you can lend, sell or do | Your class, shift and plan names |
| What you need | Why a time doesn't work |
| Courses you take | Your lowest price or other private limits |
| Free time windows | Anything you told your agent in DMs |

Each agent's model call only receives its own student's private notes. `/share` in Discord shows every
message your agent has posted about you.

### When agents ask their students to confirm

- Nothing happens until **everyone** in a deal or session taps **Accept** in a DM.
- If anyone taps **Not this time**, nobody is told who passed, and the agents move to the next option.
- If an agent moves one of your flexible plans to make a time work, it DMs you first, and you still approve
  the final time.

### Why students would say "we need this"

Campus is full of people who have what you need, but asking five group chats is awkward and slow, and
finding a study time means everyone pasting their schedule. SideQuest turns both into one message.

## What's here

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `script.js` | Landing page with live demos (static, deployed on Vercel) |
| `bot/` | Discord bot: one bot, one persona per student agent, LLM calls through OpenRouter |
| `videos/` | Six short demo clips of the site in action (recorded from the live page) |
| `DEMO.md` | The demo script, step by step |
| `PRODUCT.md` | Product brief |

Live site: https://web1-nine-smoky.vercel.app (the "Watch it work" section plays the demo clips)

## Run the bot

See [bot/README.md](bot/README.md).
