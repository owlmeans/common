---
name: viable-mcp
description: How to use @owlmeans/viable-mcp — the npx MCP server a coding agent drives the OwlMeans Viable platform with — the stdout guard that keeps everything but JSON-RPC off the protocol stream, browser sign-in (`login`/`logout`/`status`/`url`, the `~/.owlmeans` credentials file and its precedence), the lazily opened single-flight session, and the marker-based attach. Auto-invoked when changing the MCP server, its configuration, its sign-in, its startup behaviour, or diagnosing a host that reports the server as broken.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/viable-mcp

**Layer:** Tooling (CLI)
**Install:** nothing — a coding agent runs `npx -y @owlmeans/viable-mcp@^0.1.18-rc.46`; bin name `viable-mcp`
**Everything it does is `@owlmeans/viable-sdk`** — this package is the stdio process around it:
configuration, sign-in (over `@owlmeans/cli-auth`), the stdout guard, and the server object. The planning client the story tools write
through is wired inside `makeSdkContext` as well — the planning tree, `appendPlanningClient` with no
socket and no startup schema fetch — so the server builds nothing of its own for it and starts without
a network call. Operator-facing setup is the viable repo's `mcp.md`.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeViableMcpServer(cfg)` → `{ server, close }` | The configured `McpServer` with the catalogue registered |
| `configHelper` — `.readConfig(argv, env)` (async) · `.parseArgs(argv)`; `HELP` | What this server was started with: flags over the merged environment + `~/.owlmeans` |
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
backs `ToolDeps.notify`: a refusal only a person resolves — the balance, the spend consent, a
conversion's confirmation (`viable-sdk`'s `refusalHelper.personRefusalPhrase`) — is pushed to
`server.sendLoggingMessage({ level: 'warning', logger: 'viable', data: text })`, i.e. an MCP
`notifications/message`, independent of the tool result text. The platform's own stateless `/mcp`
host has no channel to push through and passes no `notify` at all — treat it as always best-effort.

## Sign-in: a browser, not a pasted token

No token is required to start. `configHelper.readConfig` merges `envFileHelper.loadOwlmeansEnv(process.env)` — the dotenv-style
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
| `url` | Prints the platform's `/mcp` URL to **stdout** — the one command whose answer belongs there, through `protocolStdout` — for `claude mcp add --transport http viable "$(npx -y @owlmeans/viable-mcp@^0.1.18-rc.46 url)"` |

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
user which project this is. Capabilities are reported honestly per mode (`sessionCapabilities`):
the disk executors (`files`, `shell`, `git`) follow the target — a cloud target offers none of
them —, `model` is advertised exactly when `llm=local`, and `human` always.

A delegated create needs a session that names NO project (`viable-sdk`'s handover): `deps.detach()`
sets the attached project to `null`, so the holder retires a project session and opens an unattached
one, whose id the create sends; attaching the new project afterwards re-opens onto it.

Deleting the attached project is the other move off a project: `deps.release` is the holder's own
`release` (close the held session — awaiting one still opening — and forget it), and `delete_project`
calls it and then `deps.detach()` BEFORE the platform's delete, so nothing is delivered to a project
that is going away and the next tool opens a fresh session. A host without `release` would close
`currentSession()` itself and leave the holder believing it still holds one.

`serverInstructions` (from the SDK) states the workflow, one line mapping every capability family the
host offers (never naming a hidden tool), and the rules that are not discoverable from a tool list —
long operations are jobs read through domain status and cursor feeds, an irreversible tool needs the
user's agreement as `confirm: true`, billing, token creation, consent grants, connector approval and
the GitHub authorization's completion stay in the browser, and in the delegated mode this session
performs EVERY model call of the platform (a tool blocked on one answers with the task) — so a parent
that read only that could still drive the platform correctly. The deps also carry one `createInflightCalls()`
registry for the life of the process: the handover's calls outlive every session the holder reopens.

## Modes

`target=local, llm=cloud` is the default: the project lives in the user's working directory, the
model calls are the platform's — every one of them, a conversion's included — and billed to their
credits; the task loop (`next_task`/`submit_task_result`) is not offered. `--llm local` makes every
model call the parent's: the session opens through the gated delegated route, `model` is advertised,
the task loop and the handover are on, and `makeSdkContext({ llm: cfg.llm })` turns on the SDK's
request-now-collect-later transport: every write is named with `x-viable-call`, an early `{ pending }`
answer is collected through `connect.call.collect`, and each request and collect hop keeps
`TOOL_DEADLINE_MS` (the context and `makeRemoteConnectorApi` both get it in every mode) — a call
waiting on the parent's own model call lasts as long as that task, never bounded by one HTTP
request or the edge (see [[viable-sdk]]). `--target cloud` keeps the project's tree and preview on
the platform, so the catalogue offers the slot's file tools (`list_files` with its metadata kinds,
`read_file`, `write_file`, `delete_file`), `preview_control` and the git and GitHub tools
(`git_status`, `git_history`, `git_commit`, `git_discard`, `git_revert`, `connect_github` — an address
the person opens; the authorization completes in their browser, never here —, `publish_to_github`,
`github_sync`, `disconnect_github`, `github_repositories`, `link_github_origin`; the GitHub token is
never answered) and the production tools (`production_status`, `publish_production` — with
`confirm: true` —, `production_control`, `custom_domain` with the DNS records to create,
`production_auth` — never the client secret —, `set_production_redirects`) and `file_changes` (the
slot tree's changes by cursor) instead of the local run tools;
`list_slots` (the organization's workloads) is offered in every mode, and so are the platform-side
records: the project settings with the read-only credit and `set_platform_credit`, the
configuration variables (`project_configuration` — a backend value never shown —,
`update_project_configuration`, `recollect_configuration`) and the organization's defaults
(`organization_branding`, `update_organization_branding`, `backfill_project_branding`), the
person's own records (`inference_settings`, `set_inference_mode` — the default only, never this
server's own `--llm` —, `list_access_tokens`, `revoke_access_token`, `privacy_choices`,
`withdraw_marketing_consent`, `pickup_intent`; nothing mints a token or gives a consent) and the
generated app's sign-in — the IAM is the platform's for a local project too (`app_users` — with `all`,
every app of the organization —, `manage_app_user`, `app_permissions`, `set_app_permission_default`,
`app_grants`, `manage_app_grant`, `app_organizations`, `manage_app_organization`, `app_groups`,
`manage_app_group`; a removal or a group deletion only with `confirm: true`) and the cursor feeds
that replace the browser's sockets (`project_activity`, `notifications` — each answers its cursor and
the call that reads on; no socket is ever opened); a write
that ends in a configuration push opens the session first, so a local target's `.env` is written
through this server. `VIABLE_API_URL` points the server at a
self-hosted or development deployment, which is what every end-to-end test does. It is that
deployment's PUBLIC API origin — path-less, the host that serves the connector, planning, `/mcp`
and the OAuth authorization server, `https://api-<web host>` for an OwlMeans Viable dev
environment — never the web app's `/api`, which answers none of the connector's routes. The device
sign-in and `/oauth/revoke` run against the same origin, and it is the token's issuer.

## Tests

`bun test ./tests` — `config.spec.ts` (flag > environment > file precedence, empty environment values, `url`), `stdio.spec.ts` (the built
binary over a real stdio transport, against an unreachable API: what the server announces — the
default mode's core, local, settings and planning-kit tools, the manual story moves, the project delete
and the lock release, the activity and notice feeds (and no `file_changes`), and NO task loop; the cloud
target's `file_changes` and production tools; the delegated mode's
task loop and its instructions — answers
and contains before its first successful call; no token → it starts and an API tool answers with a sign-in refusal) and `session-holder.spec.ts` (re-binding, the
single-flight guard, the project → unattached → new project moves of a delegated create, and recovery
from a failed open — all offline, over a fake opener); `capabilities.spec.ts` pins the executor set of
each of the four modes.

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
