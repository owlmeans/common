---
node: viable
scope: "packages/viable-common/**, packages/viable-sdk/**, packages/viable-mcp/**"
updated: 2026-10
---

# Viable connector family (contracts + SDK + MCP server)

Three packages that let something outside the OwlMeans Viable platform drive it:
`viable-common` (runtime-free contracts), `viable-sdk` (the connector SDK, Node/Bun tooling), and
`viable-mcp` (the `npx` stdio MCP server around the SDK). The platform lives in the `viable`
product repo, which consumes all three. Related: [[llm]], [[agent]], [[versioning]].

## Facts

- `viable-common` is the single contract store for the runtimes that must agree — the platform's
  API services, the agent, the publisher inside a slot, and the SDK on a developer's machine.
- The platform's REFUSAL classes (conversion, moderation, reserved name, target integrity) are
  declared in the product repo, so the SDK cannot `instanceof` them: they arrive as a marshalled
  `type|||marker|||stack` and are matched by marker.
- During prerelease, `viable-mcp` is distributed under `next` but install commands carry its
  compatible caret range (the skill's harness-written Install line). Version-skew tolerance against
  the separately deployed platform is a design constraint for this family and nothing else.
- The `viable-sdk` local executor is the publisher's dispatcher re-implemented for a laptop —
  same commands, same "error text or null" answers — so the platform cannot tell which side answered.
- `AccessBlock.defaultEnabledPermissions` stays a MODEL-written key even though the IAM's
  permission model uses default classes: the library's access policy turns it into `defaults` /
  `entityScoped` and empties it in a tenanted area.
- `agent/presentation.ts` is the runtime-free taxonomy for agent thinking/history output:
  category, language or semantic subtype, and specialist role are classified from source
  attribution plus content; `isAgentMessageHidden` suppresses source-extractor range selections.

## Invariants

- Nothing may key a decision on `ConnectCapabilities.tiers`: the MCP server always sends `{}`
  (a tier's entry is the parent agent's own model name, which this side cannot know).
- One ceiling per value across the stack — `CONNECT_INQUIRY_MAX_TEXT` equals
  `DEFAULT_INQUIRY_ANSWER_CHARS`, and the `INQUIRY_STATE_TEXT_CHARS` pair likewise. Broke when
  violated: an answer accepted on the wire and silently halved further in.
- A tool a host cannot serve is HIDDEN by `visibleTools`, never offered and refused; anything that
  can take minutes returns a job rather than holding the 45-second tool deadline.
- A transient job long-poll failure falls back once to `wait=0`; a second long poll can overrun the
  tool ceiling. Story mutations attach the session before touching local file-backed state.
- `delete_story` returns only after two observations prove the asynchronous scaffold cleanup left
  the project unlocked; otherwise the next project tool can lose an invisible `AgentLocked` race.
- Local installs use `bun install --force --backend=copyfile`: agent-writable dependencies must not
  share cache inodes, and a stale host cache must not outrank the locked package body.
- Thinking-event `presentation` is an optional hint for rolling compatibility; server finalization
  and browser streaming both use `classifyAgentMessage`, and known tool-call arguments are never
  presented as a raw JSON dump.

## Gotchas

- A nullable enum written as `nullable: true` without `null` in `enum` compiles and passes every
  caller that omits the key, then refuses the one that sends `null` — fingerprint: a provider's
  structured answer (unset optional as `null`) retried to `llm:retry-exceeded`.

## Pointers

- Skills `viable-common` (contracts + the schema conventions), `viable-sdk` (tools, sessions,
  envelopes, refusals, the local executor), `viable-mcp` (the stdio process), `inquiry`,
  `agent-presentation`.
- Product-side counterparts: `viable` repo skills `connect`, `viable-converter`, `intent-first`;
  tenancy and access policy: `viable-agent` skill `target-tenancy`.
