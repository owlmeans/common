---
name: self-education
description: Mandatory post-development guidance updating — after functionality is added or changed, rewrite the project skills the work touched as current rules (never as change notes), record external-doc findings (URL + gist) in the governing skill, or add skills for new subsystems and technologies. Required before the completion report whenever development started from a plan agreed with the agent.
user-invocable: true
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Self-education

After functionality is added or changed, the guidance that describes it must catch up — the agent
teaches itself for next time. This pass runs after implementation and verification, **before**
the completion report.

## When (mandatory)

Development "started from planning" when the session produced a plan the operator approved before
implementation — a plan-mode approval, an agreed written plan/spec, or an explicit "go ahead" on
a proposed approach. **Approval of a plan is simultaneously approval of its implicit final step:
this self-education pass.** A planned task is not finishable without it. If guidance files cannot
be edited (read-only run), list the required updates in the report instead.

Also recommended after any unplanned change that made an existing skill inaccurate.

## Review checklist

For each area the work touched:

1. Which existing skill covers it? Check `.agents/skills/`, and — where the project has one —
   `.agents/linked-skills/`, for ground a skill this project does not own already covers.
2. Do its commands, paths, APIs, and behavior claims still hold after the change?
3. Fix in place — rewrite the affected lines so they describe current behavior; never append a
   note about what this change did.

## Shape of an update

A skill states **current rules, not what changed**. Every edit is a rewrite in
place of the affected lines.

Never write into a skill: dated bulletins ("2026-07-05 — …"), phase or migration
status ("Phase 3 complete", "migration done", "landed"), "formerly X, now Y", incident
narratives, fixed-bug logs, or point-in-time inventories. If a line only makes sense to someone
who watched the change happen, it does not belong in guidance — the rule it taught does, stated
timelessly. Facts too specific to generalize go to `.agents/memory/` (`agent-memory`); the
rewrite recipe is `memory-promotion` → Distillation.

Test: a finished skill reads as though the feature was always this way.

## Skills this project does not own

A skill that came from somewhere else is not edited here, and the two kinds fail differently:

- An entry under `.agents/linked-skills/<name>` is a symlink into the repo or installed package
  that owns the skill. Writing through it edits the owner's own file — an unrequested change in
  another project, which nothing here undoes: the link script only creates and prunes symlinks.
- A skill placed by the `@owlmeans/agent-skills` installer is a real file at
  `.agents/skills/<name>/SKILL.md` carrying
  `<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->`. The next install
  overwrites every file still carrying that banner, so an edit made under it is lost; strip the
  banner and the file instead becomes a conflict the installer skips and reports.

When such a skill gained an important usage pattern during the work, capture the pattern in a
local skill under `.agents/skills/`, named after the pattern — a local skill named after the
upstream one shadows it for the whole project — and list the upstream skill in the report as an
upstream candidate. Changing the skill at its source is a separate change in the owning project,
made only on explicit operator request.

## External docs

If the work required reading internet documentation for an external API, library, or service,
the governing skill must record it under an `## External docs` heading:

```
- <URL> — <one-line gist of what it settled> (<version/date if load-bearing>)
```

Governing skill = the project skill covering the touched area; else the skill covering that
library; if none exists and the technology will recur, create one (update-vs-create rule in
`memory-promotion`). Never leave doc findings only in memory or the conversation.

## New subsystems / technologies

When new technology or a new subsystem entered the repo: create the skill for its procedures,
and/or the `.agents/memory/` node for its facts — split along the
memory-vs-skill boundary (`agent-memory` / `memory-promotion`).

## Completion gate

The completion report must contain a Self-education table:

| Item | Action | Path |
|---|---|---|
| <area/skill> | updated / created / none-needed | <path> |

"none-needed" requires a one-phrase reason. A post-plan completion report without this table is
a protocol violation.
