# @owlmeans/create-app

Scaffold a minimal **fullstack OwlMeans Common** app in one command.

```sh
npm create @owlmeans/app@latest my-app
# or
bun create @owlmeans/app my-app
# or
yarn create @owlmeans/app my-app
# or
npx @owlmeans/create-app@^0.1.18-rc.14 my-app
```

## What it generates

A bun-workspace monorepo with three packages and **no authentication**:

```
my-app/
├── AGENTS.md                       # agent context, read by every coding agent
├── CLAUDE.md                       # thin bridge: imports AGENTS.md, links skills for Claude Code
├── .agents/skills/<name>/SKILL.md  # deployed agent skills
├── .agents/memory/MEMORY.md        # shared agent memory index
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
(`.agents/skills/`).

`AGENTS.md` carries the four mandatory sections a real OwlMeans monorepo uses — **Git Workflow**,
**Reporting**, **Memory**, **Self-Education** — plus a project-purpose placeholder your agent fills
in on its first session. GitHub Copilot and Codex read `AGENTS.md` and `.agents/skills/` natively;
Claude Code reads `CLAUDE.md`, which imports `AGENTS.md` and keeps per-skill symlinks in
`.claude/skills/` fresh through `sh .agents/scripts/link-skills.sh`. The harness guidance (memory
protocol, self-education, git policy, skill authoring, reuse-first) ships with the template, so it
is present even with `--no-install`.

## Options

| Flag | Description |
|------|-------------|
| `--name <name>` | Human-readable app name (default: derived from the target dir) |
| `--slug <slug>` | Package slug, `^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$` (default: derived from the target dir) |
| `--lang <code>` | Language of the generated UI text and `<html lang>` (default: `en`) |
| `--description <text>` | One-line description used in `README.md`, `AGENTS.md`, the Home screen and the `index.html` meta tags |
| `--bare` | Scaffold the working shell with no example/demo code |
| `--pm <bun\|npm\|yarn>` | Package manager (default: `bun`) |
| `--no-install` | Skip dependency installation |
| `--no-skills` | Skip the `@owlmeans/agent-skills` deploy |
| `--no-git` | Skip `git init` |
| `--yes`, `-y` | Proceed without prompts / into a non-empty directory |
| `--help`, `-h` | Show help |

## `--bare`

`--bare` keeps the three workspaces, the config/context/entrypoint wiring, the layout, the nav
skeleton and one Home screen, and drops every piece of example code — the `SessionItem` types and
schemas, the api's `app/session/**` handlers and its static resource, the About and Session screens.
`sources/common/src/entrypoints.ts` exports an empty `sharedEntrypoints` that the api and the web
already spread, so the first feature is one declaration plus a handler and a screen.

What bare removes and what it swaps in is declared in `template/_bare.json`, next to the
`.bare.`-infixed variants it points at — not in the scaffolder's code.

## Programmatic use

`scaffold` performs the filesystem copy and nothing else: no `git init`, no install, no
agent-skills deploy, no logging. The destination directory may already exist.

```ts
import { scaffold } from '@owlmeans/create-app'

scaffold({
  dir: '/tmp/my-app',
  slug: 'my-app',
  name: 'My App',        // default: the titleized slug
  lang: 'en',
  description: 'What the app is for.',
  bare: true,
})
```

`templateDir()`, `copyTemplate(src, dest, replacements, { bare })` and `isEmptyDir(dir)` are
exported for callers that want the pieces; `run(args)` is the full CLI flow.

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
