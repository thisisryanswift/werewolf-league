---
id: wl-y1yp
status: closed
deps: []
links: []
created: 2026-11-21T18:45:39Z
type: bug
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# League feed: resync clients after League DO hibernation

From the wl-d5wn codex review (P1, src/core/league-feed.ts:69). After the League DO hibernates, the in-memory diff baseline is lost. The next tiles diff resends tiles whole but lists no removals, so tiles that settled in the meantime linger on connected grid clients.

## Acceptance Criteria
- [ ] With no baseline (e.g. after hibernation or eviction), the League sends a full {type:'league'} snapshot, or otherwise resyncs, so clients drop settled tiles
- [ ] A whole-system test simulates a lost baseline and checks that a connected client ends up with exactly the live tiles


## Notes

**2026-11-21T19:09:50Z**

Merged into integration/wl-xgp7 (impl/wl-y1yp 56c06b9; fix c24b0f9). Verification on integration: full suite passes, typecheck clean. AC1: test/league/feed-coalescer.test.ts sends a whole league snapshot when there is no baseline, then normal diffs with removals. AC2: test/system/league-scale.test.ts evicts the League DO with a hibernatable WS open; after a settlement the client's tiles exactly equal the live tiles (fails with the fix reverted). codex: no findings.
