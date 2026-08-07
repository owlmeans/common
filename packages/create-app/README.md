# @owlmeans/create-app

Scaffold a minimal **fullstack OwlMeans Common** app in one command.

```sh
npm create @owlmeans/app@latest my-app
# or
bun create @owlmeans/app my-app
# or
yarn create @owlmeans/app my-app
# or
npx @owlmeans/create-app my-app
```

## What it generates

A bun-workspace monorepo with three packages and **no authentication**:

```
my-app/
├── CLAUDE.md                       # agent context for Claude Code
├── .github/copilot-instructions.md # the same for GitHub Copilot
├── .agents/memory/MEMORY.md        # shared agent memory index (both tools)
├── sources/
│   ├── common/   # shared entrypoints (routes), schemas and types
│   ├── api/      # @owlmeans/server-app backend; session data in an in-memory static resource
│   └── web/      # @owlmeans/web-panel + shadcn UI: navigation, layout and screens
```

The web app ships a basic shadcn UI **navigation + layout** and a **Session** screen
that creates, lists and removes items held in a **session-scoped in-memory resource**
(`@owlmeans/static-resource`) on the backend — no database required.

By default the scaffolder also installs dependencies and **deploys agent guidance**
into the project via [`@owlmeans/agent-skills`](https://www.npmjs.com/package/@owlmeans/agent-skills)
(`.claude/skills/` + `.github/instructions/`).

`CLAUDE.md` and `.github/copilot-instructions.md` carry the four mandatory sections a real OwlMeans
monorepo uses — **Git Workflow**, **Reporting**, **Memory**, **Self-Education** — plus a
project-purpose placeholder your agent fills in on its first session. Project memory is one shared
graph store at `.agents/memory/` for both tools. The harness guidance (memory protocol, self-education,
git policy, skill authoring, reuse-first) ships with the template, so it is present even with
`--no-install`.

## Options

| Flag | Description |
|------|-------------|
| `--name <name>` | Human-readable app name (default: derived from the target dir) |
| `--pm <bun\|npm\|yarn>` | Package manager (default: `bun`) |
| `--no-install` | Skip dependency installation |
| `--no-skills` | Skip the `@owlmeans/agent-skills` deploy |
| `--no-git` | Skip `git init` |
| `--yes`, `-y` | Proceed without prompts / into a non-empty directory |
| `--help`, `-h` | Show help |

## Running the generated app

```sh
cd my-app
bun install      # if you passed --no-install
bun run dev      # api on :3000, web on :3001
```

## Doing it manually instead

Prefer to wire it up by hand? Follow
[docs/getting-started.md](https://github.com/owlmeans/common/blob/main/docs/getting-started.md),
which documents both the scaffolded and the manual path step by step.
