---
node: viable
scope: "packages/viable-common/**, packages/viable-sdk/**"
updated: 2026-10
---

# Viable connector family (contracts + SDK + MCP server)

The public half of what lets something outside the OwlMeans Viable platform drive it:
`viable-common` (runtime-free contracts) and `viable-sdk` (the connector SDK, Node/Bun tooling).
The stdio servers (`viable-mcp-core` and its editions `viable-mcp`, `viable-claude`,
`viable-codex`) and the agent-setup tools (`viable-harness`) are closed-source, in the `closed`
repo, which links this one; the SDK reaches them only through seams (`ToolHost.extensions`,
`ToolHost.profile`), never by import. The platform lives in the `viable` product repo.
Related: [[llm]], [[agent]], [[versioning]].

## Facts

- `viable-common` is the single contract store for the runtimes that must agree — the platform's
  API services, the agent, the publisher inside a slot, and the SDK on a developer's machine.
- The platform's REFUSAL classes (conversion, moderation, reserved name, target integrity) are
  declared in the product repo, so the SDK cannot `instanceof` them: they arrive as a marshalled
  `type|||marker|||stack` and are matched by marker.
- During prerelease, `viable-mcp` is distributed under `next` but install commands carry its
  compatible caret range (the skill's harness-written Install line). Version-skew tolerance against
  the separately deployed platform is a design constraint for this family and nothing else.
- A connector names its edition only in `x-viable-client` (`<kind>/<version>`): an older platform
  ignores an unknown header but refuses an unknown body field (`ConnectSessionOpenSchema` is closed),
  and an older connector may validate a response. New data therefore crosses on new routes only
  (`connect.client.identify`); a header-less request is `legacy` and keeps its exact behaviour.
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
- With no `ToolHost.profile` every SDK output is byte-identical — `tools/list` (no `outputSchema`
  key), instructions, `describe_platform`, results. Broke when violated: published `viable-mcp` and
  the platform's `/mcp` change under existing manual setups; store presentation goes in a profile.
- The `CONNECT_CLIENT_NO_INFERENCE` kinds never act as the platform's inference, and an unknown
  kind fails OPEN (`other` may do what `legacy` may) — a typo'd header must not lock out a client.
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
- A tool registered with an `outputSchema` whose success carries no `structuredContent` is turned
  into an MCP validation error by the server → the profile answers `present(structured ?? {})` on
  every success and never a structure on a refusal.

## Pointers

- Skills `viable-common` (contracts, client kinds, the schema conventions), `viable-sdk` (tools,
  sessions, envelopes, refusals, profiles, the local executor), closed's `viable-mcp-core` (the
  stdio process) and its editions, `inquiry`, `agent-presentation`.
- Product-side counterparts: `viable` repo skills `connect`, `viable-converter`, `intent-first`;
  tenancy and access policy: `viable-agent` skill `target-tenancy`.
