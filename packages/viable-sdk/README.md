# @owlmeans/viable-sdk

Drive the OwlMeans Viable platform from outside it.

Viable turns a description into a running full-stack application. This package is what lets
something that is not the Viable manager do that: a coding agent through
[`@owlmeans/viable-mcp`](../viable-mcp), a CLI, a test. It owns the four things such a client
needs and the platform cannot supply:

- **a client context** that authenticates with one long-lived access token and nothing else;
- **a connector API** — one interface, two implementations, so a tool written against it works
  both over HTTP and in-process;
- **a session runtime** that answers the operations the platform sends: file writes, shell
  commands and git against a project on the user's own machine;
- **the tool catalogue and the model-task protocol** a parent agent reads.

## The two axes

A session has a **target** and an **llm**, and they are independent.

|  | `cloud` | `local` |
|---|---|---|
| **target** | the project lives in a Viable preview slot | the project lives in a directory here, and this package executes every command against it |
| **llm** | Viable performs the model calls | the parent agent performs them, one at a time, in a clean subagent |

## Using it

```ts
import {
  makeSdkContext, makeRemoteConnectorApi, openSession
} from '@owlmeans/viable-sdk'
import { makeLocalSlotExecutor } from '@owlmeans/viable-sdk/executor'
import { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'

const context = await makeSdkContext({ apiUrl, token })
const api = makeRemoteConnectorApi(context)

const session = await openSession({
  api,
  executor: makeLocalSlotExecutor(projectDir),
  open: {
    projectDir,
    target: ConnectTarget.Local,
    llm: ConnectLlm.Cloud,
    harness: ConnectHarness.Other,
    clientVersion: '1.0.0',
    capabilities: { harness: ConnectHarness.Other, tiers: {}, subagents: false, effortControl: false, executors: [] },
  },
})

const job = await api.project.create('a tool for tracking gym workouts', ConnectTarget.Local)
```

The session runs its own loop from that point: operations arrive, the executor answers them, model
tasks queue for the parent agent.

## Rules worth knowing before you change something

**Every tool answers within 45 seconds.** The strictest MCP host in the field bounds a tool call at
sixty. Anything that takes minutes is a JOB: it returns at once and is polled. A tool that blocked
would be reported to the user as a hung server rather than as a slow platform.

**A tool that cannot work in a mode is hidden, not failing.** `visibleTools(host)` is the whole
catalogue a parent sees, and it is exactly the set of things that work for it. A tool offered and
then refused is one an agent tries once and remembers as broken.

**The session loop is serial.** The thing on the other end of a local operation is a filesystem the
platform believes it is the only writer of. Two concurrent template writes into one tree is not a
throughput problem, it is a corrupted tree.

**Results are cached by operation id.** A connector that reconnects is handed everything still
outstanding, including what it had already answered when the connection dropped. Re-running a build
because an acknowledgement was lost is exactly the cost that cache avoids.

**A malformed model-task answer is refused locally.** `parseTaskResult` checks the answer against
the task before the platform ever sees it — with the subagent's context still open, so the parent
can retry immediately. A malformed answer that reached the platform would cost a whole new task, a
new subagent and another wait.

**The harness installer never writes the token.** Each configuration references the environment
variable in its own syntax, so what it writes is safe to commit. `tests/harness.spec.ts` greps
every written file for a token shape.

## Tests

`bun test ./tests` — all offline.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.15
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
