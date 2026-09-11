---
name: viable-mcp
description: How to use @owlmeans/viable-mcp — the npx MCP server a coding agent drives the OwlMeans Viable platform with — the stdout guard that keeps everything but JSON-RPC off the protocol stream, the environment-only token, the lazily opened single-flight session, the marker-based attach, and the capabilities each target × llm mode advertises. Auto-invoked when changing the MCP server, its configuration, its startup behaviour, or diagnosing a host that reports the server as broken.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/viable-mcp

**Layer:** Tooling (CLI)
**Install:** nothing — during the prerelease a coding agent runs
`npx -y @owlmeans/viable-mcp@^0.1.18-rc.1`; bin name `viable-mcp`
**Everything it does is `@owlmeans/viable-sdk`** — this package is the stdio process around it:
configuration, the stdout guard, and the server object. Operator-facing setup is the viable repo's
`mcp.md`.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeViableMcpServer(cfg)` → `{ server, close }` | The configured `McpServer` with the catalogue registered |
| `readConfig(argv, env)` · `parseArgs(argv)` · `HELP` | What this server was started with |
| `sessionCapabilities(cfg)` → `ConnectCapabilities` | What the session opened from that configuration advertises |
| `DEFAULT_API_URL` · `DEFAULT_TARGET` (`local`) · `DEFAULT_LLM` (`cloud`) | The defaults a user who set nothing gets |
| `protocolStdout` | The one stream that reaches the real stdout |
| `VERSION` | Reported to the host and sent as `clientVersion` |

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

## The token comes from the environment only

`VIABLE_API_TOKEN` is never read from an argument. A command line is readable by every process on
the machine and lands in shell history, and a credential that leaks that way leaks silently.
Everything else may be a flag, because everything else is a preference: `--api-url`, `--target`,
`--llm`, `--harness`, `--project-dir`, each with an `ENV_*` twin. A missing token exits 2 with
instructions rather than starting a server that will 401 on every call.

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
user which project this is.

`serverInstructions` (from the SDK) states the workflow and the two rules that are not discoverable
from a tool list — long operations are jobs, and which of the platform's model calls this session is
the one to perform — so a parent that read only that could still drive the platform correctly.

## What the connector advertises is what the platform will ask of it

`sessionCapabilities(cfg)` (`src/capabilities.ts`) composes the `ConnectCapabilities` the session
opens with. It lives beside the server rather than inside it because the platform goes by nothing
else: an executor claimed by mistake is an operation queued for a connector that will never answer
it, and one omitted by mistake is a run that quietly does without.

An executor says what this connector **can** do, never what the platform must ask of it, and never
who pays for it.

- `Files` / `Shell` / `Git` follow the **target** — a cloud project's files are not on this machine.
- `Model` and `Human` are advertised **always**, by every connector and in every mode. A coding
  agent is a model with a person in front of it by definition, which is the whole reason the
  platform can hand it either kind of work; a run that finds no `human` executor assumes an answer
  instead of asking for one, and one that finds no `model` executor performs the call itself.

Who pays is decided per kind of work, elsewhere, and never off this list. The platform's own STORY
and FREE-FLIGHT calls follow `session.llm` — the route the session attached through, which is the
one carrying the paid delegated capability. A CONVERSION follows `converterLlmMode`, whose default
is the parent agent and whose floor is "a live session advertises `Model`". So gating `Model` on
`llm=local` did not protect anything: it made that floor unreachable for every ordinary free
session and moved every conversion onto the platform's models.

`tiers` stays `{}`: an entry is the parent's OWN name for the model it runs a tier on, which
nothing on this side knows, and a guess would be shown to the user as fact. **Nothing on the
platform may key a decision on it** for the same reason — it is empty on every session this server
opens, so a floor reading it clamps every connector. `subagents` and `effortControl` are true for
every supported harness.

Because `executors` crosses a version skew — users run `npx -y @owlmeans/viable-mcp@^0.1.18-rc.1` (the
moving prerelease tag) against a separately deployed platform — `ConnectCapabilitiesSchema.executors.items`
carries no `enum`. A newer executor kind must remain an unused capability on an older platform,
never a refused session.

## Modes

`target=local, llm=cloud` is the default: the project lives in the user's working directory, and the
platform's own model calls are the platform's, billed to their credits. A CONVERSION's calls still
come to the parent on that default, so `next_task` / `submit_task_result` are announced in every
mode — the `llm` axis is about stories and free flight. `VIABLE_API_URL` points the server at a
self-hosted or development deployment, which is what every end-to-end test does.

## Tests

`bun test ./tests` — `config.spec.ts` (argument/environment precedence), `capabilities.spec.ts`
(the CLOSED executor set each of the four target × llm modes advertises, built from a real
configuration so a flag that stops reaching the capabilities is caught too; closed rather than
containment, because an executor claimed by mistake is an operation queued for a connector that
will never answer it), `stdio.spec.ts` (the built binary over a real
stdio transport, against an unreachable API: what the server announces, answers and contains before
its first successful call) and `session-holder.spec.ts` (re-binding, the single-flight guard, and
recovery from a failed open — all offline, over a fake opener).

`stdio.spec.ts` needs `build/bin.js`, so `bun run build` comes first.

## Depends On

- `@owlmeans/viable-sdk` — the context, the API, the session, the catalogue, the local executor
- `@owlmeans/viable-common` — the connector vocabulary · `@modelcontextprotocol/sdk` · `zod`

## Related

- [[viable-sdk]] — every rule about tools, deadlines, sessions and the local executor
- [[auth-token]] — where the token comes from and how it is presented
- [[inquiry]] — what the `human` executor is for: how a run asks a person and waits for the answer
