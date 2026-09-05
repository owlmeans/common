---
name: skill-authoring
description: How to add agent guidance to an OwlMeans project — author one skill at .agents/skills/<name>/SKILL.md that every agent reads, choose frontmatter that validates across Claude Code, Copilot and Codex, refresh the Claude Code symlinks, and decide skill vs memory. Use when asked to capture knowledge as a skill, add a slash command, or document a repeatable procedure.
user-invocable: true
metadata:
  scope: general
---

# Authoring agent guidance (skills)

An OwlMeans project carries agent guidance in up to three places:

| What | Where | Loaded |
|---|---|---|
| Always-on project context | `AGENTS.md` at the repo root | every session |
| Always-on policy, kept out of `AGENTS.md` | `.agents/rules/<topic>.md`, pulled in from `AGENTS.md` by an `@.agents/rules/<topic>.md` import line | every session |
| Topic guidance | `.agents/skills/<name>/SKILL.md` | on demand, by topic or `/<name>` |

The middle tier is optional and belongs to a repo that has grown standing policy of its own. A
project scaffolded by `@owlmeans/create-app` starts without a `.agents/rules/` directory: its
generated `AGENTS.md` states the git policy inline and points at the seeded `git` skill for the
rest. Follow the layout the project already has — add a rules file only where `AGENTS.md` already
imports one.

**Rule or skill?** A rule is policy that has to hold whether or not anyone thought to load
anything — the git workflow is the standing example, whether a repo keeps it as
`.agents/rules/git.md` or inline in `AGENTS.md`. A skill is guidance for a task, loaded when that
task comes up. If it only matters while you are doing X, write a skill; if breaking it is wrong at
any moment, put it where `AGENTS.md` loads it every session.

`.agents/skills/` is the [Agent Skills](https://agentskills.io) standard location: GitHub Copilot
and Codex discover it natively. Claude Code reads skills only from `.claude/skills/`, so each skill
is bridged there by a generated symlink — see "Refresh the Claude Code links" below. **Write a skill
once; never author a per-agent copy** (`.github/instructions/*.instructions.md`,
`.github/copilot-instructions.md`, or a real file under `.claude/skills/`).

## Skill layout

```
.agents/skills/<name>/
├── SKILL.md          # required — frontmatter + body
├── reference.md      # optional — deeper detail loaded on demand
└── scripts/          # optional — shell scripts the skill runs
```

## Frontmatter

```yaml
---
name: my-skill                  # REQUIRED, must equal the directory name (lowercase, hyphens, ≤64 chars)
description: What it does and WHEN to use it.   # REQUIRED, ≤1024 chars — the auto-invocation signal
user-invocable: true            # false = background knowledge only, hidden from the / menu
allowed-tools: Bash(bun *), Read # optional — COMMA-separated; tools usable without per-call approval
metadata:                       # optional — anything non-standard goes here
  scope: general
---
```

The `name` is not free: it is the key every store is keyed by, and a LOCAL skill always wins over
one that arrives from a dependency. Naming a skill after a package you depend on therefore hides
that package's own guidance completely, and the installer reports the file as a conflict on every
run. Give a skill about your own use of `@owlmeans/payment` a name of its own — `billing`, or your
product's name with a suffix — never `payment`.

The `description` is the most important field: every agent uses it to decide when to load the
skill, so state both the topic and the trigger ("Use when …"). Keep it under 1024 characters —
Copilot rejects longer ones. It is YAML, so a value containing `: ` (colon-space) has to be quoted
or the file stops parsing and the skill silently disappears from every agent.

`allowed-tools` is parsed as a list split on commas, newlines and YAML `-` bullets — never on
plain spaces. `Bash(bun *) Read` is read as one tool named `Bash(bun *) Read`, which matches
nothing; write `Bash(bun *), Read`.

Six keys are what the Agent Skills frontmatter parser in `@owlmeans/agent-skills` stores:
`name`, `description`, `license`, `compatibility`, `allowed-tools` and nested `metadata`.
Project-specific keys — including the OwlMeans `scope: general` routing marker, which sends a skill
to the installer bundle rather than to one package — belong under `metadata:`, so a skill stays
valid in every agent that reads it. The invocation switches sit outside what that parser stores and
are written at the top level alongside it: `user-invocable` (`false` hides a skill from the `/`
menu, marking it background knowledge), plus `disable-model-invocation` and `argument-hint`, which
Claude Code understands. Set any of them only when the skill needs it.

## Refresh the Claude Code links

After creating, renaming, or deleting a skill, run:

```sh
sh .agents/scripts/link-skills.sh
```

It creates `.claude/skills/<name>` → `../../.agents/skills/<name>` for every local skill and prunes
links whose skill is gone. The links are gitignored and are recreated at session start (a committed
`SessionStart` hook, and on every install where the project declares a root `prepare` script that
calls it), but a skill added mid-session is invisible to Claude Code until the script runs.

The same script also brings in the skills of everything this project depends on, from whichever of
two sources applies. In a linked checkout — a repo whose root `package.json` lists an upstream
repo's packages as workspace entries — it resolves those upstream repos first, recursing into each
one's own manifest up to four levels, and links the skills from the upstream's own
`.agents/skills/`. A project that declares no such linked upstream falls back to what a plain npm
install gives it: the read-only `agent-meta/skills/` copies shipped inside each installed
`@owlmeans/*` package. Either way the links land in `.agents/linked-skills/<name>` (Copilot, Codex)
and `.claude/skills/<name>` (Claude Code), with a generated `.agents/linked-skills/INDEX.md` listing
skill, origin and description. Load one by name exactly like a local skill. A local skill of the
same name always wins, and a nearer dependency wins over a farther one. The whole
`.agents/linked-skills/` directory is generated and git-ignored — never edit or commit it, and never
edit an `agent-meta/` copy: fix the skill in the package that ships it.

## Skill vs memory

- **Skill** — a reusable procedure or reference you (or the agents) will want again, worth loading
  automatically. Lives in `.agents/skills/`.
- **Memory** — a fact, decision, or gotcha specific to this project's history/state. Lives in the
  shared `.agents/memory/` graph store. See the `agent-memory` skill; promotion triggers and the
  update-vs-create rule live in `memory-promotion`.

If you find yourself writing "last time we…", that is memory. If you are writing "to do X, do Y",
that is a skill.

Never paste memory text into a skill. Memory content enters guidance only as a restated general
rule — trigger, step, and the failure it prevents, with dates, phase/status markers, versions and
incident narrative stripped (`memory-promotion` → Distillation).

## After adding a skill

1. If it replaces an ad-hoc `.agents/<topic>.md`, remove that file.
2. If it distilled memory content into rules, shrink the source `.agents/memory/` node to a
   pointer line (`memory-promotion`) — the memory index does not list skills.
3. Reference it from `AGENTS.md` if it should be discoverable every session.
4. Run `sh .agents/scripts/link-skills.sh`.
