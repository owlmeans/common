---
node: viable
scope: "packages/viable-common/**, packages/viable-sdk/**, packages/viable-mcp/**"
updated: 2026-09
---

# Viable connector family (contracts + SDK + MCP server)

Three packages that let something outside the OwlMeans Viable platform drive it:
`viable-common` (runtime-free contracts), `viable-sdk` (the connector SDK, Node/Bun tooling), and
`viable-mcp` (the `npx` stdio MCP server around the SDK). The platform itself lives in the `viable`
product repo, which consumes all three. Related: [[llm]], [[agent]], [[versioning]].

## Facts

- `viable-common` is the single contract store for four runtimes that must agree — the manager
  API, the agent, the publisher inside a slot, and the SDK on a developer's machine. A vocabulary
  copied instead of imported is how one tree gets two totals and one ceiling two values.
- The platform's REFUSAL classes (conversion, moderation, reserved name, target integrity) are
  declared in the product repo, not here, so the SDK cannot `instanceof` them: they arrive as a
  marshalled `type|||marker|||stack` and are matched by marker.
- `viable-mcp` is run as `npx -y @owlmeans/viable-mcp`, i.e. always the LATEST version against a
  separately deployed platform. Version-skew tolerance is a design constraint for this family and
  for nothing else in the repo.
- The `viable-sdk` local executor is the publisher's dispatcher re-implemented for a laptop —
  same commands, same "error text or null" answers — so the platform's remote helpers cannot tell
  which side answered.

## Invariants

- Nothing may key a decision on `ConnectCapabilities.tiers`: the MCP server always sends `{}`
  (a tier's entry is the parent agent's own model name, which this side cannot know).
- One ceiling per value across the stack — `CONNECT_INQUIRY_MAX_TEXT` equals
  `DEFAULT_INQUIRY_ANSWER_CHARS`, and the `INQUIRY_STATE_TEXT_CHARS` pair equals likewise. Broke
  when violated: an answer accepted on the wire and silently halved further in.
- A tool a host cannot serve is HIDDEN by `visibleTools`, never offered and refused; anything that
  can take minutes returns a job rather than holding the 45-second tool deadline.

## Pointers

- Skills `viable-common` (contracts + the schema conventions), `viable-sdk` (tools, sessions,
  envelopes, refusals, the local executor), `viable-mcp` (the stdio process), `inquiry`.
- Product-side counterparts live in the `viable` repo: skills `connect`, `viable-converter`.
