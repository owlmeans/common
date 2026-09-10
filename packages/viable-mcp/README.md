# @owlmeans/viable-mcp

An MCP server that lets Claude Code, Codex, Copilot or OpenCode build full-stack web applications
with the OwlMeans Viable platform.

Viable turns a description into a running application: it plans the product, generates the code,
provisions the database and identity provider, and serves a live preview. This server puts that
platform in front of a coding agent as a set of tools — so the agent describes the product,
confirms the plan, develops stories, edits files and runs the result, while the project itself
lives either in a Viable slot or in the directory the agent is working in.

Everything it does is [`@owlmeans/viable-sdk`](../viable-sdk); this package is the stdio process
around it.

## Running it

```sh
VIABLE_API_TOKEN=vib_… npx -y @owlmeans/viable-mcp
```

Configure it as an MCP server in your agent, or let the agent's own `install_harness` tool write
that configuration for you. The written configuration references `VIABLE_API_TOKEN` in the
harness's own syntax and never contains the token itself, so it is safe to commit.

```
Options
  --api-url <url>       The platform's API
  --target local|cloud  Where the generated project lives. Default: local
  --llm cloud|local     Who performs the platform's model calls. Default: cloud
  --harness <name>      claude-code | codex | copilot | opencode
  --project-dir <path>  The local project directory. Default: the working directory
  --http <port>         Serve over HTTP instead of stdio (development)
```

Each flag has an environment twin (`VIABLE_API_URL`, `VIABLE_TARGET`, `VIABLE_LLM`,
`VIABLE_HARNESS`, `VIABLE_PROJECT_DIR`). **The token is environment-only** — a command line is
readable by every process on the machine and lands in shell history.

## The two axes

|  | `cloud` | `local` |
|---|---|---|
| **target** | the project lives in a Viable preview slot | the project lives in a directory here, and this server executes every file, shell and git command against it |
| **llm** | Viable performs its own story and free-flight model calls | your agent performs them, one at a time, in a clean subagent |

A **conversion** — bringing an application that already exists onto Viable — is different: its
model calls come to your agent by default in every mode, unless the account or project setting
says otherwise. That is why the task tools are announced whatever `--llm` says.

## Things worth knowing before you change it

**stdout is the protocol.** A stray `console.log` lands inside a JSON-RPC frame and the host
reports the server as broken. `stdout-guard.ts` is imported first in the process: the console and
any direct `process.stdout.write` are redirected to stderr, where the host shows them as server
output, and the transport is handed the only remaining handle to the real stdout.

**The session is opened lazily, once, and belongs to one project.** A parent that only asks what
the connector can do should not make the platform file a session; two tools called in one turn
must not open two, the second superseding the first. A local project's `.viable/connect.json` is
read at startup so a connector started in a familiar directory picks up where the last one left
off.

**What the connector advertises is what the platform will ask of it.** The file, shell and git
executors follow `--target`. `model` and `human` are advertised always: a coding agent is a model
with a person in front of it, and a run that finds no `human` executor assumes an answer instead
of asking for one. Who pays is decided elsewhere, never off that list.

**Every tool answers within 45 seconds.** Anything longer is a job: it returns at once and is
polled with `wait_for`.

## Tests

`bun run build && bun test ./tests` — offline throughout; `stdio.spec.ts` drives the built binary
over a real stdio transport against an unreachable API.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
