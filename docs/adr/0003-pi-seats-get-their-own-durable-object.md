# Pi seats get their own Durable Object

A seat on the `pi` Harness runs Earendil's Pi Durable through Cloudflare's PiHarness, inside a dedicated `PiSeatDO`, one per seat per Match. That seat's `PlayerDO` drives it over RPC through the Harness interface's `startTurn`/`poll`.

PiHarness can't be installed into `PlayerDO`. Its Lifecycle owns the Durable Object's single alarm and skips handlers the class already defines, and `PlayerDO` already uses `alarm()` to poll turns. A separate object keeps the Harness interface, Match and League unchanged, and it follows ADR-0001's one-object-per-seat pattern.

## Considered Options

- **Regular, non-durable Pi inside `PlayerDO`**: no new object type, but we would have to persist Pi's conversation ourselves and lose Pi's recovery after an eviction.
- **Pi running inside the Agent37 sandbox**: an apples-to-apples comparison with Managed Agents, but Agent37's chat endpoint returns text only, so our game tools would need an unproven bridge.
