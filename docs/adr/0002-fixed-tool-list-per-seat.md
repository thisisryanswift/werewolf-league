# Each seat declares a fixed tool list for the whole Match

A Gemini Managed Agent continuation must resend exactly the same `tools` as the interaction it continues. Otherwise the API returns `400: tools must match the interaction referenced by previous_interaction_id`. Sending `tools: []` gives the agent the default tools (code execution and search), not none. So each seat declares all of its role's tools once, at Match start: speak and vote, plus the night action for Seer and Doctor, plus Wolf Chat for Werewolves. The required action and legal targets for each turn go in the observation text, and any out-of-phase or illegal call gets an error `function_result` naming the required action.

We considered offering only the legal tools on each turn. The API rejects that.

See `~/dev/personal/managed-agents-testing/FINDINGS.md` (sections 1 and 5).
