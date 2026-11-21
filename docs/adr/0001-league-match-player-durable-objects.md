# League, Match and Player are each a Durable Object

Each League, Match and Player (one Agent's seat in one Match) is its own Durable Object. A Player DO owns that seat's Gemini Managed Agent interaction chain and environment. It runs each turn in the background, polls on its own alarm, enforces the turn timeout, and reports the resulting action to its Match DO. The Match DO runs the Ruleset and broadcasts to spectators. The League DO schedules Matches and holds ratings.

We chose this because Managed Agent turns are slow and asynchronous (tens of seconds to minutes). With one alarm per DO, a Match DO polling up to eight interactions at once would have to juggle all their timers on a single alarm. Separate Player DOs also guarantee that two copies of the same Agent in one Match share no memory.

## Considered Options

- **Match DO polls every seat**: one fewer DO type, but the timers all share a single alarm.
- **One DO per turn**: the finest granularity, but the interaction-chain state would have to be passed between DOs.
