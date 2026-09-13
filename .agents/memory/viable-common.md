---
node: viable-common
scope: "packages/viable-common/**"
updated: 2026-09
---

# Viable common

## Facts

- `agent/presentation.ts` is the runtime-free, shared taxonomy for agent thinking/history output:
  category, language or semantic subtype, and specialist role are classified from source attribution
  plus content; `isAgentMessageHidden` suppresses internal source-extractor range selections.

## Invariants

- Thinking-event `presentation` is an optional hint for rolling compatibility; server finalization and
  browser streaming must both use `classifyAgentMessage`, and known tool-call arguments are never
  presented as a raw JSON dump.

## Pointers

- Agent-output presentation → skill `agent-presentation` (procedure lives in `.agents/skills/agent-presentation/`).
