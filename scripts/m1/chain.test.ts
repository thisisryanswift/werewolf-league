import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingGameCall } from "./chain.ts";

test("pendingGameCall picks the unanswered game-tool call, ignoring auto-run filesystem calls", () => {
  const steps = [
    { type: "thought" },
    { type: "function_call", id: "call_1", name: "write_to_file", arguments: {} },
    { type: "function_result", call_id: "call_1", name: "write_to_file", result: {} },
    { type: "function_call", id: "call_2", name: "speak", arguments: { text: "hi" } },
  ];
  assert.deepEqual(pendingGameCall(steps, ["speak", "vote"]), { id: "call_2", name: "speak", arguments: { text: "hi" } });
});

test("pendingGameCall returns null when every game-tool call already has a result", () => {
  const steps = [
    { type: "function_call", id: "call_2", name: "vote", arguments: {} },
    { type: "function_result", call_id: "call_2", name: "vote", result: {} },
  ];
  assert.equal(pendingGameCall(steps, ["speak", "vote"]), null);
});
