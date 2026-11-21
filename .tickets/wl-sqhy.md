---
id: wl-sqhy
status: in_progress
deps: []
links: []
created: 2026-11-21T20:43:47Z
type: bug
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Pi: release provisioned sandboxes when a Match start fails

Seen on the deployed pi-open League at 15:41: Agent37 caps the workspace at 8 instances (32 GB), so one 7-seat Pi Match fits. A start that failed with 409 instance_limit_reached left its already-provisioned sandboxes running (4 orphans for Match 5aed52ec), so every later start failed and could leak more. The pause sweep only removes wl-pi-* older than 2 h.

## Acceptance Criteria
- [ ] When a Match start fails after some seats provisioned, those seats are released (Harness close / sandbox delete), best effort and non-blocking
- [ ] Test: a start where seat k fails calls close on the earlier seats exactly once; the League can retry


## Notes

**2026-11-21T20:43:47Z**

Mitigation 15:47: pi-open set to N=1, and the 4 orphan sandboxes (wl-pi-5aed52ec-*) deleted with human approval; the live Match 070b2bfb's 7 kept. Fix in progress on impl/pi-leak.
