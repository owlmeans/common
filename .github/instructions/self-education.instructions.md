---
description: "Mandatory post-development skill/instruction updating — after adding or changing functionality, update touched project guidance, note external-doc findings in the governing instruction, or add instructions for new subsystems/technologies; required before the completion report when development started from an agreed plan. Apply when editing skills or instruction files after development."
applyTo: "**/.claude/skills/**, **/.github/instructions/**"
---

# Self-education

After functionality is added or changed, the guidance that describes it must catch up — the agent
teaches itself for next time. This pass runs after implementation and verification, **before**
the completion report.

## When (mandatory)

Development "started from planning" when the session produced a plan the operator approved before
implementation — a plan approval, an agreed written plan/spec, or an explicit "go ahead" on a
proposed approach. **Approval of a plan is simultaneously approval of its implicit final step:
this self-education pass.** A planned task is not finishable without it. If guidance files cannot
be edited (read-only run), list the required updates in the report instead.

Also recommended after any unplanned change that made an existing instruction/skill inaccurate.

## Review checklist

For each area the work touched:

1. Which existing instruction/skill covers it? (Check `.github/instructions/` +
   `.claude/skills/`.)
2. Do its commands, paths, APIs, and behavior claims still hold after the change?
3. Fix in place — and keep the instruction and its skill twin in sync.

## Non-project instructions

If a general or imported instruction gained an important usage pattern during the work, add the
pattern to the **deployed copy** in this repo and note it in the report as an upstream
candidate — canonical archive copies change only on explicit operator request.

## External docs

If the work required reading internet documentation for an external API, library, or service,
the governing instruction must record it under an `## External docs` heading:

```
- <URL> — <one-line gist of what it settled> (<version/date if load-bearing>)
```

Governing instruction = the project instruction covering the touched area; else the one covering
that library; if none exists and the technology will recur, create one (update-vs-create rule in
`.github/instructions/memory-promotion.instructions.md`). Never leave doc findings only in
memory or the conversation.

## New subsystems / technologies

When new technology or a new subsystem entered the repo: create the instruction/skill pair for
its procedures, and/or the `.agents/memory/` node for its facts — split along the
memory-vs-instruction boundary (`.github/instructions/agent-memory.instructions.md` /
`.github/instructions/memory-promotion.instructions.md`).

## Completion gate

The completion report must contain a Self-education table:

| Item | Action | Path |
|---|---|---|
| <area/skill> | updated / created / none-needed | <path> |

"none-needed" requires a one-phrase reason. A post-plan completion report without this table is
a protocol violation.
