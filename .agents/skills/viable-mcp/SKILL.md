---
name: viable-mcp
description: How to use @owlmeans/viable-mcp — the npx MCP server a coding agent drives the OwlMeans Viable platform with — the stdout guard that keeps everything but JSON-RPC off the protocol stream, browser sign-in (`login`/`logout`/`status`/`url`, the `~/.owlmeans` credentials file and its precedence), the lazily opened single-flight session, and the marker-based attach. Auto-invoked when changing the MCP server, its configuration, its sign-in, its startup behaviour, or diagnosing a host that reports the server as broken.
user-invocable: false
---

# @owlmeans/viable-mcp

**Layer:** Tooling (CLI)
**Install:** nothing — a coding agent runs `npx -y @owlmeans/viable-mcp@^0.1.18-rc.24`; bin name `viable-mcp`
**Everything it does is `@owlmeans/viable-sdk`** — this package is the stdio process around it:
configuration, sign-in (over `@owlmeans/cli-auth`), the stdout guard, and the server object. The planning client the story tools write
through is wired inside `makeSdkContext` as well — the planning tree, `appendPlanningClient` with no
socket and no startup schema fetch — so the server builds nothing of its own for it and starts without
a network call. Operator-facing setup is the viable repo's `mcp.md`.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeViableMcpServer(cfg)` → `{ server, close }` | The configured `McpServer` with the catalogue registered |
| `readConfig(argv, env)` (async) · `parseArgs(argv)` · `HELP` | What this server was started with: flags over the merged environment + `~/.owlmeans` |
| `makeCredentials(cfg, log)` · `CLIENT_ID` (`viable-mcp`) | The one credential holder `bin.ts` and `server.ts` both build |
| `DEFAULT_API_URL` · `DEFAULT_TARGET` (`local`) · `DEFAULT_LLM` (`cloud`) | The defaults a user who set nothing gets |
| `McpConfig.mcpUrl` | The URL-configured host's address, `resolveMcpUrl(merged)` — printed by `url`; this server never calls it |
| `protocolStdout` | The one stream that reaches the real stdout |
| `VERSION` | Reported to the host and sent as `clientVersion`; READ from the package's own `package.json` (`src/version.ts`), never a literal, which lagged a whole line of releases |

## stdout IS the protocol

A stdio MCP server's stdout carries JSON-RPC and nothing else. One stray line — a framework's
`console.log`, a deprecation notice, a library announcing itself — lands in the middle of a message
frame, and the host reports a parse error, which reads to the user as "this server is broken"
rather than "something printed". The OwlMeans framework packages log to the console freely and are
right to; what has to change is where the console goes.

`stdout-guard.ts` is imported **first**, before anything else in the process, because a module that
logs at import time would otherwise print before the guard was in place. It has two halves: the
console is redirected to stderr, where a host shows it as server output, and `process.stdout.write`
is replaced by the same redirect — so anything reaching for stdout directly is still **seen** rather
than dropped, since losing a diagnostic to protect the protocol trades one silent failure for
another. The transport is handed `protocolStdout`, which closes over the real handle and is the only
path to it.

`tests/stdio.spec.ts` pins this by driving the **built binary** as a coding agent does, against an
API that cannot be reached: what a connector does before its first successful call — announce its
tools, answer the offline ones, contain a failure, write nothing but JSON-RPC to stdout — is the
whole of a user's first impression.

## `sendLoggingMessage` is a silent no-op without the `logging` capability

`server.ts` declares `capabilities: { logging: {} }` on the `McpServer` constructor, before
`registerCatalogue` runs — the MCP SDK's `Server.sendLoggingMessage` checks the declared
capabilities and does **nothing** (no error, no throw) when a server never advertised `logging`, so
a refusal notice built there would simply vanish with nothing anywhere saying so. This is what
backs `ToolDeps.notify`: an out-of-credits refusal (`viable-sdk`'s `registerCatalogue`) is pushed to
`server.sendLoggingMessage({ level: 'warning', logger: 'viable', data: text })`, i.e. an MCP
`notifications/message`, independent of the tool result text. The platform's own stateless `/mcp`
host has no channel to push through and passes no `notify` at all — treat it as always best-effort.

## Sign-in: a browser, not a pasted token

No token is required to start. `readConfig` merges `loadOwlmeansEnv(process.env)` — the dotenv-style
credentials file (`~/.owlmeans`, moved by `OWLMEANS_CREDENTIALS`) under the process environment — so
**the environment always wins over the file**, and an EMPTY environment value is ignored (a harness
that expands an unset `${VIABLE_API_TOKEN:-}` to `''` must not shadow the file). A missing token is
`cfg.token === ''`, meaning "not signed in yet", and never an exit: the server announces its tools
and answers the offline ones either way.

`server.ts` builds the holder with `makeCredentials` and hands `makeSdkContext` a token **thunk**
plus `onRejected`. The remote `ConnectorApi` is wrapped by `withSignIn` (a recursive Proxy): every
call — a namespaced one (`api.project.status`) and a top-level one (`api.projectBranding`) alike —
first awaits `credentials.require(SIGN_IN_WAIT_MS)` (20 s, inside every host's tool deadline),
so no tool remembers to ask and a member added to the interface needs no wiring here. The first real API call of a fresh process starts ONE device sign-in
(RFC 8628, HTTP polling — `device_code` never leaves the process, no socket to defend); later calls
join the same wait. If it is still pending at the deadline the call fails with `SignInRequired` — a
sentence naming the URL and code, which the calling agent reads and acts on (`REFUSALS` in
`viable-sdk` phrases `oauth:sign-in-required:<url> <code>`, `oauth:token-rejected:<VAR>` and the
guard's `api:auth:guard:auth-token`; the code rides in the message because a phrase table receives
nothing else) — while polling
continues in the background and the next call succeeds. A browser opens only for that first
sign-in, never because an agent merely launched the server.

A 401 on the token being presented calls `invalidate`: a file token is dropped (the next call signs
in again), an environment token is reported as refused and never silently swapped for another
identity. A token is bound to the file's `VIABLE_API_URL` and is only ever sent there.

Subcommands (`bin.ts`; the first bare argument, absent = the server):

| Command | Does |
|---|---|
| `login` | Runs the device sign-in to completion (15 min ceiling), stores the token in the file |
| `logout` | Revokes the token (`/oauth/revoke`) and forgets it |
| `status` | Reports on stderr whether this machine is signed in |
| `url` | Prints the platform's `/mcp` URL to **stdout** — the one command whose answer belongs there, through `protocolStdout` — for `claude mcp add --transport http viable "$(npx -y @owlmeans/viable-mcp@^0.1.18-rc.24 url)"` |

The `/mcp` URL is `VIABLE_MCP_URL` (environment over file), else `https://api.owlmeans.com/mcp`
(`resolveMcpUrl` in viable-sdk). A test or a self-hosted setup overrides it; a deployment's own
resource identifier stays host-derived on the server.

`VIABLE_API_TOKEN` is never read from an argument. A command line is readable by every process on
the machine and lands in shell history, and a credential that leaks that way leaks silently.
Everything else may be a flag, because everything else is a preference: `--api-url`, `--target`,
`--llm`, `--harness`, `--project-dir`, each with an `ENV_*` twin.

`--http <port>` serves the connector over HTTP on loopback instead of stdio. It is a DEVELOPMENT
transport, and it exists for one reason: a stdio server lives and dies with the command that
started it, so an agent that issues one command per turn would restart it on every call and
supersede its own connector session each time. Over HTTP the server outlives the turn, which is
what lets the agent running it also BE the parent in the delegated mode.

It is STATEFUL — one transport for the life of the process, `sessionIdGenerator` returning a real
id that the client echoes back as `mcp-session-id`. The stateless mode the platform's own `/mcp`
uses wants a fresh server per request, which is right there and wrong here: this server holds the
connector session. Bound to 127.0.0.1 only, since it carries whatever token started it.

## The session is opened lazily, single-flight, and filed against ONE project

A parent agent that only asks what the connector can do should not make the platform file a session,
and a session opened at startup against a project that does not exist yet has nothing to attach to.
So the first tool that needs one opens it — and two tools called in one turn must not open two, the
second of which supersedes the first and orphans whatever the first was already answering.

**A session belongs to the project it named**, because the platform delivers a project's operations
to that session. So the project the tools are working on and the project the open session was opened
for must be the same, and `makeSessionHolder` (`src/session-holder.ts`) is what makes them so:
`attach` alone changes a variable, and a holder-less server would carry on using a session filed
against the previous project — or against no project at all, which `next_task` can open before
anything is attached. That failure is silent and total: every operation for the new project stays
undelivered, the run blocks until its deadline, and nothing reports an error.

Two details of the holder are load-bearing and each was a defect:
- The project is claimed when an open **starts**, not when it resolves. Claiming it on resolution
  makes two tools called in one turn look like a change of project to each other, and the
  single-flight guard opens the second session it exists to prevent.
- A failed open is forgotten rather than remembered as in-flight, or every later call awaits a
  promise that already rejected and the connector never recovers from one bad moment on the network.

A re-open awaits an open that is still in flight before closing it. Dropping the promise instead
leaves a session filed on the platform that nothing will ever close, and only the sweeper notices.

For a local target the directory's `.viable/connect.json` is read at startup, so a connector started
in a project that was worked on before picks up where the last one left off rather than asking the
user which project this is. Capabilities are reported honestly per mode: a cloud target offers no
executors at all.

`serverInstructions` (from the SDK) states the workflow and the two rules that are not discoverable
from a tool list — long operations are jobs, and in the delegated mode this session performs the
platform's model calls — so a parent that read only that could still drive the platform correctly.

## Modes

`target=local, llm=cloud` is the default: the project lives in the user's working directory, the
model calls are the platform's and billed to their credits. `VIABLE_API_URL` points the server at a
self-hosted or development deployment, which is what every end-to-end test does.

## Tests

`bun test ./tests` — `config.spec.ts` (flag > environment > file precedence, empty environment values, `url`), `stdio.spec.ts` (the built
binary over a real stdio transport, against an unreachable API: what the server announces — the
default mode's core, local and settings tools — answers
and contains before its first successful call; no token → it starts and an API tool answers with a sign-in refusal) and `session-holder.spec.ts` (re-binding, the
single-flight guard, and recovery from a failed open — all offline, over a fake opener).

`stdio.spec.ts` needs `build/bin.js`, so `bun run build` comes first. Every spec that reads configuration
sets `OWLMEANS_CREDENTIALS` to a temp path — the developer's real `~/.owlmeans` must never leak in. An
automation run also sets `OWLMEANS_NO_BROWSER=1` so `login` does not open a window.

## Depends On

- `@owlmeans/viable-sdk` — the context, the API, the session, the catalogue, the local executor
- `@owlmeans/cli-auth` · `@owlmeans/oauth` — the credentials file, the browser opener and the device sign-in holder
- `@owlmeans/viable-common` — the connector vocabulary · `@modelcontextprotocol/sdk` · `zod`

## Related

- [[viable-sdk]] — every rule about tools, deadlines, sessions and the local executor
- [[auth-token]] — how the token is presented, its audience, and the carrier's `onRejected`
- [[cli-auth]] — the credentials file and the sign-in holder (skill written alongside the package)
