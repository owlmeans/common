---
name: viable-sdk
description: How to use @owlmeans/viable-sdk — the connector SDK an external coding agent drives the OwlMeans Viable platform with — the token-authenticated client context, the two host kinds and their tool catalogue, the session operation loop, the model-task and question envelopes, the conversion tools, the local slot executor and local run, and the harness installer. Auto-invoked when building or changing a connector, an MCP host, a connector tool, a task or question envelope, or anything that executes platform slot commands on a developer's machine.
user-invocable: false
---

# @owlmeans/viable-sdk

**Layer:** Tooling (Node/Bun; not a browser or React package)
**Install:** `"@owlmeans/viable-sdk": "^0.1.18-rc.3"` in `dependencies`
**Subpaths:** `.` · `./executor` · `./run` · `./tools` · `./task` · `./harness`
**Contracts:** `@owlmeans/viable-common` (`./connect`, `./slot`, `./integrity`) — every name on the
wire is declared there, so the SDK and the platform cannot spell one differently.

Everything a coding agent needs in order to drive the platform: authenticate with one access token,
attach a session to a project, execute the platform's slot commands against a directory on this
machine, deliver its model calls to the parent agent, and run the generated application locally.
`@owlmeans/viable-mcp` is one host built on it.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeSdkContext({ apiUrl, token, service? })` | A client context authenticated by one token, with the connector routes elevated |
| `makeRemoteConnectorApi(context)` | `ConnectorApi` over HTTP |
| `openSession(opts)` → `SessionRuntime` | One attached session: the operation loop, the task and question queues, `stats` |
| `OpQueue<T>` · `TaskQueue` · `QuestionQueue` | The delivery discipline both parent-answered operation kinds share |
| `renderTaskEnvelope(task, { harness })` · `parseTaskResult(task, raw)` | What the parent agent is told; what its answer is checked against |
| `renderQuestionEnvelope(inquiry, { harness })` · `parseAnswer(inquiry, raw)` · `CONFIRM_YES`/`CONFIRM_NO` | The same pair for a question put to a person |
| `PLATFORM_CATALOGUE` · `renderPlatform(catalogue, host)` | What the platform runs, and which of it this session can drive |
| `makeModelTaskDriver({ models })` · `TaskDriver` | A reference parent agent backed by a chat model (tests, CLIs) |
| `installHarness(dir, harness, opts?)` · `describeHarness(harness)` · `WORKING_RULE` | Set a coding agent up; preview it first |
| `catalogue` · `visibleTools(host)` · `toolByName` · `registerCatalogue(server, deps)` · `serverInstructions({ host })` | The tools and how they reach an MCP server |
| `renderJob(job)` · `isSettled(job)` | A job as a few lines a model can act on |
| `REFUSALS` · `refusalPhrase(e)` · `refusalMessage(e)` · `UNKNOWN_REFUSAL` / `UNPHRASED_REFUSAL` | Every refusal marker, and the one sentence a parent reads instead of it |
| `ToolHostKind` (`Stdio`/`Http`) · `ToolHost` · `ToolDeps` · `anyHost`/`localTarget`/`cloudTarget`/`withExecutor`/`delegatedLlm`/`sessionCapable`/`performsModelTasks` | The host description and the availability predicates |
| `./executor`: `makeLocalSlotExecutor(dir, opts?)`, `createLocalFileHelper`, `createLocalShellHelper`, `dispatchGitCommand`, `verifyTarget`/`forgetIntegrity`, `targetPaths`/`apiPath`/`webPath`/`workerPath`, `backendEnv`/`frontendEnv`, `classifyTargetHealth`/`readTargetHealth`, `runBootCheck`, `confineToProject`, the spawn helpers | The publisher's job, on somebody's laptop |
| `./run`: `runLocal`, `stopLocal`, `localStatus`, `createLocalServer`, `startApi`/`startWorker`/`restartApi`/`stopProcess`, `readRun`/`writeRun`/`clearRun` | Building and running the generated app locally |
| `readMarker`/`writeMarker`/`discoverProject`/`isViableTree` · `readEnv`/`writeEnv`/`envStatus`/`replaceManagedBlock` | The `.viable/connect.json` marker and the managed `.env` block |
| `SdkError`, `SdkAuthError`, `SdkMisconfigured`, `SdkUnsupported` | Registered `ResilientError` classes |
| `ENV_TOKEN`, `ENV_API_URL`, `ENV_TARGET`, `ENV_LLM`, `ENV_HARNESS`, `ENV_PROJECT_DIR` · `TOOL_DEADLINE_MS` (45 s) · `NEXT_TASK_WAIT_MS` · `NEXT_QUESTION_WAIT_MS` · `PULL_WAIT_MS` | Configuration and deadlines |

## One credential, and the routes the server declares

`makeSdkContext` registers `makeTokenCarrierGuard` under `DEFAULT_GUARD` and elevates the SAME
`connectEntrypoints(...)` list the server mounts, so a path or a schema cannot be right on one end
and wrong on the other. There is deliberately **no second credential path**: a connector that could
fall back to another form of authentication is a connector whose access nobody can revoke by
revoking a token. A token without `CONNECT_TOKEN_PREFIX` is refused locally, because a 401 says
nothing about which of several plausible mistakes was made and the answer is always the same one.

**The context must also declare the platform's `/update` base itself.** The connector's socket route
hangs under that namespace, and a parent an entrypoint registry cannot resolve fails the **whole
context at init** rather than the one call that would have used it — a server that exited at startup
with `Entrypoint viable:manager-api:update:base not found`. It is declared with the path the
platform declares and never elevated: it is a namespace, and nothing calls it.

**`cfg.webService` names the API CLIENT, never the backend.** It is the alias the entrypoint handler
looks up with `context.service(...)`, and the only thing registered under it is the `ApiClient` that
`makeClientContext` appends (`web-client`). Naming the backend service there — which is exactly what
`addWebService` does — makes every call fail with `Service <backend> not found` before a request is
sent. The backend belongs in `cfg.services` as an ordinary descriptor marked `default: true`; the
connect routes name no service of their own, so that is the one they resolve to.

**A POST with nothing to say still sends `{}`.** The client sets no `Content-Type` for an absent
body, and Fastify answers **415 Unsupported Media Type** before the handler runs — an error about
media types for a call whose only fault was having no arguments. `makeRemoteConnectorApi` fills an
empty body for any POST route that was given none; `session.close` and `session.heartbeat` are
exactly that shape.

## Two hosts, one interface

`ConnectorApi` is an interface because two implementations must stay interchangeable — one calling
the API over HTTP (`makeRemoteConnectorApi`, the npx server) and one calling the manager's own
handlers in process (`makeInProcessConnectorApi` in `viable-manager-api`, behind `POST /mcp`). Every
tool is written against it, so a tool cannot accidentally work in only one of the two. Which route
`openSession` calls fixes the mode: the delegated route carries the entitlement gate, so a caller
without the capability is refused at the boundary rather than by a check somewhere inside.

Cloud-target `list_files` goes through `ConnectorApi.files.list`, backed by the shared
`connect.files.list` route. The platform reuses its ownership-checked file-browser handler, while
the SDK only renders the returned relative paths; a local target hides the tool because its files
are already in the parent agent's directory.

## A SESSION belongs to a host that stays; `sessionCapable` is what says so

A session is a connector ATTACHED — a process that drains the project's operations and holds a model
task until its answer comes back. The URL-configured host answers one request and forgets, so
opening one there would claim the project's single connector slot, **supersede the stdio connector
legitimately holding it**, and be abandoned before the first operation was delivered.

So `ensureSession` — what `confirm_project`, `reinitialize_project`, every story mutation,
`develop_story`, `modify_project` and `resume_pipeline` call before doing their work — opens one
only on a `sessionCapable` host, and **every tool that answers for the parent is gated on that predicate**:
`next_task`/`submit_task_result` as much as `next_question`/`answer_question`. A host that cannot
serve the delegated mode says so in one sentence instead, naming the stdio connector — a parent
told to call a tool that is not in its list waits for a run nobody will advance.

`performsModelTasks` (delegated **and** session-capable) is a WORDING predicate, never an
availability one. Two different kinds of work reach the parent through the same two tools, and only
one of them follows the account setting: the platform's own STORY and FREE-FLIGHT calls do, while a
CONVERSION's are the parent's **by default on any session-capable host**. Gating the tools on the
setting therefore left an ordinary `llm=cloud` session sitting on a job blocked on a task it had no
tool to collect. What the predicate still decides is the sentence — "this session runs the
platform's model calls on YOUR side" versus "the platform performs its own, but a conversion's are
yours" — in `serverInstructions`, `describe_capabilities` and `renderPlatform`'s session line.

The in-process implementation refuses the five session verbs (`openSession`, `closeSession`,
`heartbeat`, `pullOps`, `submitOp`) with a message naming `@owlmeans/viable-mcp`, because
"unsupported" alone leaves the reader with nothing to do about it.

## A tool that cannot work in a mode is HIDDEN, not failing

`ToolDefinition.availability` and `visibleTools(host)` decide the catalogue a parent actually sees. A
tool a host cannot serve is a tool the parent tries once, is refused, and remembers as broken — so
the list it reads is exactly the set of things that work for it. Predicates: `anyHost`,
`localTarget`, `cloudTarget`, `withExecutor`, `sessionCapable`, `delegatedLlm`.

## 45 seconds is the ceiling, which is why long operations are JOBS

Every MCP host bounds a tool call and the strictest default in the field is sixty seconds (Codex).
`TOOL_DEADLINE_MS` leaves room for the round trip and keeps the connector inside every host's
ceiling without configuration. A tool that outlives its host's ceiling is reported to the user as a
**broken server**, and the true answer — the platform was slow — never reaches them.

So anything that takes minutes returns a `ConnectJob` at once and is polled with `wait_for`.
`registerCatalogue` enforces the deadline per call and converts a throw into an `isError` result the
model can read and act on, because an exception crossing the transport tells it only that something
went wrong somewhere. `renderJob` ends every job with a single `next:` line — that is what keeps a
parent from inventing a polling strategy of its own, or from concluding that a blocked run has
failed.

A dropped project-job long poll is retried as one immediate snapshot, never as a second long poll.
`recoverLongPoll` recognises transport resets/timeouts through their cause chain and reads the same
durable job row with `wait=0`; replaying another thirty-second wait can cross the MCP tool ceiling
after the first response failed near its end. Deliberate API refusals are not transport failures and
are rethrown unchanged.

`delete_story` settles the asynchronous scaffold cleanup before it returns. The manager mutation
acknowledges the queued agent work while that work may still be acquiring or holding the project
lock, so the SDK samples project status until it has observed the project unlocked for 500 ms; one
unlocked read is not proof that cleanup has started. If cleanup does not settle within five minutes,
the tool reports that boundary instead of letting the parent's next project operation lose an
unobservable `AgentLocked` race.

## A refusal is PHRASED from its marker, and a stack never reaches the parent

The `isError` shape is not enough on its own, because what fills it is the thing a model then acts
on. Every refusal the platform raises — the conversion family, the converter's own, moderation, a
reserved name, an integrity verdict, a balance — is declared in a package this one does not depend
on, so `ResilientError.ensure` finds no converter for the type name, keeps the WHOLE marshalled
`type|||marker|||stack`, and hands back an error whose `message` is a LOCAL stack trace with that
string on its first line. Handed over unchanged, `purge_origin` answered a deliberate refusal with
`Error: ConversionErrorViableAgentCommonError|||viable-agent-common:conversion:purge-in-place|||…`
and a stack from a machine the reader has no access to — from which a parent learns only that
something failed, and retries a call that can never succeed.

`REFUSALS` (`src/tools/refusal.ts`) is the map, and five rules hold it together:

- **Matched by MARKER, never by class.** An `instanceof` is impossible for a class declared
  elsewhere, and the same refusal arrives twice over: thrown from a call, and stored as text in
  `job.error` / `slot.lastError` with no class left on it. `refusalPhrase` takes a string as
  readily as an error — the same rule, and the same reason, as the manager's `useErrorPhrase`, and
  it matches the same substrings so the two cannot phrase one refusal two ways.
- **Ordered by specificity**, because the first marker the message contains wins: every reason of a
  family sits above the family's own marker. `catalogue.spec.ts` pins that no marker is a substring
  of a later one rather than leaving it to review.
- **An unknown marker KEEPS the marker and still names a next step** — the middle segment, with the
  marshalling and the stack cut off, followed by `UNPHRASED_REFUSAL`. The marker alone is honest
  and is what stays honest as the platform grows a refusal nothing here has a sentence for yet, but
  on its own it is wire text with no tool to call. The next step is appended only to text that
  READS as a marker (`package:family:reason`): a deadline message, a gateway error and a build
  warning are not refusals and are returned exactly as they stand. `UNKNOWN_REFUSAL` is the other
  half — said where nothing at all was given to phrase.
- **A stack never reaches the parent, and the shape with no separator is the one that hid.**
  `ResilientError.ensure`'s fall-through converter is `new ResilientError(err.message, err.stack)`
  against a `(type, message, stack)` constructor, so `type` ends up holding the MESSAGE and
  `message` the STACK — nothing marshalled, nothing to split on. It is reached whenever a class is
  unrecognised, and `processResponse` in `@owlmeans/api` ensures ANY string response body, so an
  edge 502/503 in plain text handed the model a trace of the SDK's own frames. `textOf` detects
  that shape first (`<Name>: <type>` followed by the frames) and keeps the message.
- **The detail is kept where the reader can act on it** — the brand in a reserved name, the file
  list in an integrity verdict, the unlinked paths, the stack the converter has no knowledge of,
  the stage transition that was refused. The one detail never shown is a moderation CATEGORY: like
  the manager, `content-refused:` is phrased from the category in words, so no model's own
  explanation becomes the sentence a user is read.

It is applied wherever a refusal can be READ, and a channel left out is a channel that contradicts
the others — one run answered `wait_for` with the sentence and `conversion_status` with
`viable-agent-common:conversion:relocate-declined`, for the same refusal. Thrown: the conversion
verbs wrap their own body (`answering` in `catalogue.ts`), so a refusal comes back as the ANSWER it
is, with `isError` set, from inside the tool that knows what was asked; `registerCatalogue` phrases
whatever escapes any other tool. STORED: `renderJob` for `job.error`, `renderConversion` for a
conversion's `lastError`, `project_status` for `slot.lastError` and its two warning fields,
`pipeline_status` for a run row's `error`. One helper serves all of them because only the TEXT says
which a value is — `backendWarning` carries an integrity verdict, `buildWarning` carries build
diagnostics — and anything that does not read as a marker comes back exactly as it stands,
stack-shaped lines included.

Whatever answers a refusal also LOGS it, with `refusalMessage` rather than the phrase: a marker is
what a person greps for and the stack is not theirs. `answering` writes `<tool> refused: <marker>`
itself, precisely because answering inside the tool is what takes the five convert verbs out of
`registerCatalogue`'s catch — without it a refused conversion is the one thing the connector log
says nothing about.

## The session loop: serial, and free to redeliver

`openSession` pulls operations, answers them **one at a time**, and puts model tasks aside. Serial
because the thing on the other end of a local operation is a filesystem the platform believes it is
the only writer of — two concurrent template writes into one tree is not a throughput problem, it is
a corrupted tree.

Results are remembered by operation id. A connector that reconnects is handed everything still
outstanding, **including whatever it had already answered when the connection dropped**, and the
cached result answers it without doing the work again — re-executing a build or a model task because
an acknowledgement was lost is exactly the cost this avoids. A failed `submitOp` is logged, never
thrown: the operation stays in the platform's store and is redelivered.

Model tasks are **not executed here at all** — they are the parent agent's to run in its own clean
subagent, and what the loop owes them is delivery. The operation id is kept beside each task and
never shown to the parent: a parent that could name one could answer an operation it was never
given.

A local operation that fails reports `ConnectOpErrorKind.Refused`, never `Unavailable`. The
connector ran and could not do the thing; `Unavailable` tells the platform to give up on a run that
is fine.

**The pull long-poll is the transport.** It works through every proxy and needs no reconnection
logic. It is also the only transport a session ever uses — the URL-configured host opens no session
at all, so it never pulls. The contract declares a socket
(`connect.session.socket`, served by manager-api) and `SessionStats.transport` can say `'socket'`,
but **the SDK implements only the pull loop** — `PING_INTERVAL_MS`, `SOCKET_HANDSHAKE_MS` and
`RECONNECT_BACKOFF_MS` are declared for a socket client that does not exist yet. Treat the socket as
a platform capability, not an SDK one.

## An answer is READ in the shapes models produce, not only the one asked for

The tool-call instruction asks for a JSON array and models mostly comply — but a single call comes
back as a bare object often enough, and some wrap the array in `{tool_calls: […]}`, that assuming
the array is a defect rather than strictness. The reference driver cast straight to an array, so a
bare object threw `parsed.map is not a function`; the TypeError was handed back AS the answer, the
model ladder read that as a bad answer and asked again with feedback that said nothing about what
was wrong, and the story failed with `retry-exceeded` having never been told. `toolCallsOf` accepts
all three shapes and still throws for an answer carrying no call at all — an empty answer is a bad
answer, and the retry is the right response to it.

The same rule is why `parseTaskResult` refuses with a described reason rather than a stack trace:
whatever comes back becomes a model's next prompt, so it has to be readable by one.

## A redelivered model task must NOT be handed over twice

The platform redelivers every unanswered operation on each poll — that is what makes a connector
restart cost a round trip instead of a run, and for a slot command it is free because the result
cache answers it. A MODEL task is different: it is answered by a parent agent in tens of seconds,
and every poll during that window used to queue another copy. The parent then ran the same task
over and over — real model calls, paid for by the user, thrown away — while the job stayed blocked,
because only the first answer routed to a live operation and every later one reported that no
operation was waiting.

`OpQueue` therefore remembers every id it has handed over and ignores a second delivery of one,
keeping the memory after the item settles so a redelivery that raced the platform's deletion is
ignored rather than answered again. The operation id IS refreshed on a redelivery, because the
answer must route to the operation the platform is currently waiting on. `push` returns whether the
item was accepted, and `tasksDelivered` counts only accepted ones — a counter that grew per poll
would make a stuck run look busy.

Both things a parent answers ride on it: `TaskQueue extends OpQueue<ModelTask>` and
`QuestionQueue extends OpQueue<InquiryPayload>`, adding only `outstandingTasks()` /
`outstandingQuestions()` (the held map is `held`, so the public reading of it can carry the name
`outstanding`). They stay two queues and two tools, because draining one list would sooner or later
hand a question to a subagent — a model answering a decision that was the user's is the single
outcome the whole primitive exists to prevent.

## The task envelope is text for a model to act on

The reader is a language model working from a tool result, so it must be able to act without a
schema in front of it. Everything it must do is stated **in order and before the material** — how to
run it (in a clean subagent, per harness), what to call afterwards (`submit_task_result`, with the
id spelled out), and what shape the answer takes — so a model that stops reading early has still
read the instruction. The task id appears at the top and in the follow-up call because it is the
only thing that routes an answer back: a parent that paraphrases the rest but copies the id still
works. A retry says which attempt it is and why the previous answer was refused. Harnesses differ
only in the isolation mechanism, never in what is asked; `Other` gets the request stated rather than
mechanised.

**`parseTaskResult` refuses a malformed answer locally**, and returns a `problem` rather than
throwing. The refusal is worth more than the parse: an answer that reaches the platform malformed
costs a whole retry — another task, another subagent, another wait — while one caught here is a
sentence the parent can act on immediately, with the subagent's context still open. It unfences,
rejects an array or a scalar in `Json` mode, and rejects a tool name the task never offered.

A task is handed out ONCE, and the platform then waits on it for up to 45 minutes. So the loop has
to survive a parent that lost the envelope — a compacted conversation, a subagent that died before
answering. `next_task` takes an optional `taskId` that re-reads a task already handed out, and when
nothing new is queued but something is unanswered it NAMES the outstanding ids rather than re-handing
them: re-handing would have a parent whose subagent is still working run the same task twice. A
refused answer keeps the task outstanding for exactly the same reason.

## A question is an operation like any other, and the connector answers none of it

`ConnectOpKind.Inquiry` arrives on the same loop as everything else and is executed by nobody: it
is a decision about the user's project, and a connector that answered one would have a whole
application built on a guess nobody made. `perform` queues it, `questionsDelivered` counts it, and
`answerQuestion` mirrors `submitTask` — op id, settle, submit — so an answer travels back on the
operation the platform is waiting on.

`next_question` / `answer_question` are available on **`sessionCapable`**, for a reason of their own:
who performs the model calls has nothing to do with who answers a question, and a platform-billed
session must still be askable. What they do need is a host that STAYS, which is why the
URL-configured host offers neither.

**The envelope inverts the task envelope's one rule.** Same order — how to handle it, what to call
afterwards, then the material — but it says *do not answer this yourself*, and carries no
subagent/isolation wording at all, because the recipient is a person and a subagent has none. The
`declined: true` line is present on every question whatever its kind: a parent whose user is away
must be able to say so, or it waits out a 45-minute timeout, or invents an answer.

**Every call line the envelope prints has to be one the parent can actually make**, which is why
the value placeholder follows the KIND rather than being one line for all three. A `Confirm`
carries no options, so `"<one of the values below>"` pointed at nothing and the parent had to
already know the two words from somewhere else: it prints `"answer": "yes"` and `"answer": "no"` —
`CONFIRM_YES` / `CONFIRM_NO`, the same pair `parseAnswer` reads back, in any case a model sends
them. A `Text` question has no values either and leads with `"text"`. Only a `Choice` **carrying
options** says "below", and only such a `Choice` prints the several-answers and own-words lines: a
Choice that arrived with none is read as a text question in BOTH directions — the call prints
`"text"`, and `parseAnswer` takes text back — because `InquiryPayload.options` is optional on the
wire and only the free-flight `ask_user` tool enforces the "between 2 and max" rule, so that shape
reaches the envelope and pointed "below" at an OPTIONS section it never printed.

`parseAnswer` refuses LOCALLY, with the person still in front of the parent, and returns a
`problem` rather than throwing — the same economics as `parseTaskResult`, one round trip worse
because a human has already spent their attention on it. Its rules: `declined` short-circuits
everything; nothing supplied is a problem naming the three shapes; a `Confirm` accepts the words a
model actually sends (`yes/y/true/ok`, `no/n/false`, booleans included) and answers `CONFIRM_YES` /
`CONFIRM_NO` — a copy of `@owlmeans/llm-common`'s pair, because this package must not carry the
model runtime; a `Choice` must be one of the offered values, takes an array only where `multiple`
is set, and accepts bare `text` only where `allowText` is; a `Choice` with NO offered values takes
the `text` its envelope asked for and refuses a value naming the field that works, never accepting
it as a chosen one the asker can match against nothing; a `Text` takes the text. Every problem
lists what WOULD be accepted, so a retry needs no second reading of the envelope. The ONE ceiling
is `CONNECT_INQUIRY_MAX_TEXT`, applied to every answer carrying text — the free-text rider beside
a chosen value included, which is the one path a length the wire schema refuses could otherwise
take — and it REFUSES rather than truncating: cutting the text would hand the asker most of a
decision and say nothing.

**A parked run is still askable, and both tools reach exactly as far as each other.** An operation
expires; a run that asked while nobody was attached is left `Waiting` with a question no queue here
has seen. Both tools therefore take the same optional `jobId` and fall back the same distance —
`api.convert.status(project).pendingInquiry`, then `api.project.job(project, jobId)` and its
`ConnectJob.inquiry` — and `answer_question` sends by id through `connect.inquiry.answer` instead
of an operation. Unequal reach is a dead-end loop rather than a missing feature: `next_question`
keeps offering a question `answer_question` keeps refusing, after a person has already spent their
attention on it. Best-effort on both reads: a project with no conversion answers an error,
and failing the call that asked for a question because the lookup failed is worse than "none".

## `describe_platform` is what a parent reads before it decides how to approach a request

A tool list read one description at a time never says what the platform IS, and a parent that does
not know tends to write the application by hand instead. `PLATFORM_CATALOGUE` is static data — no
network, no token, no project — and every `ConnectJobKind` a parent can poll for has an entry, so a
job kind added without a description fails `platform.spec.ts` rather than reaching a parent as an
uninterpretable job. `renderPlatform` narrows it to the host, and **names every group it hides plus
the reason**: a shorter list with no explanation reads as a platform that cannot do the thing at
all. It is deterministic by construction, because it is meant to sit in a system prompt.

A group's `what` and the ORDER of its `tools` are a workflow, not a summary and an alphabet: they
are rendered as written, so whatever they lead with is what a parent tries first. The conversion
group therefore leads with `convert_project` and lists `check_convertible` after the decision
verbs — a check reports what the INTAKE found, so the platform refuses one asked for before a
conversion exists. Leading with it made the catalogue contradict both `serverInstructions` and the
tool's own description, and two texts on one server saying opposite things is what makes a parent
invent a third behaviour. `platform.spec.ts` pins the order.

The session line reads the OFFERED SET first and the mode second, in that order. An entitled
account resolves to `llm=local` on every host it asks from, the URL one included — so a line
branching on the mode first told a host that can hold no session that the platform's calls were
its own, while hiding the `next_task` that collects them: the parent polls a tool it does not
have and reports the server as broken. Above that floor the mode decides, because a `cloud`
session that CAN collect must still be told a conversion's calls are its own.

## Converting an application that already exists

`ConnectorApi.convert` is the group behind six tools — `check_convertible`, `convert_project`,
`proceed_conversion`, `conversion_status`, `purge_origin`, and `describe_platform` for the shape of
it. Every state-changing verb answers a JOB, one per stage (`ConnectJobKind.Convert*`), because a
conversion reads a whole repository.

- `check_convertible` charges nothing and provisions nothing, but it does not run before the
  conversion either: the census it reports is what the INTAKE found, so the platform refuses a
  check asked for before a verdict exists. It calls `ensureSession` first — a local origin is read
  through this connector, so a check dispatched before a session is filed is answered by nobody —
  and its `next:` line is derived from the conversion the project ALREADY has: `conversionNext` for
  one that has begun, "convert_project to start" only where there is none, or one still `Pending`
  or `Cancelled`. A refused verdict outranks both, since an origin nothing can convert has no next
  step whatever a run says. Saying "convert_project to start" over a live conversion points the
  parent at the one call the platform refuses, while the run sits at the decision or the question
  it is actually waiting on. The line ABOVE it names that conversion from its STATUS, never from
  the record existing — `already under way` only for `Running`/`Waiting`/`Awaiting`, `finished` for
  `Done`, `stopped at stage X` for `Failed` — because the helper filters `Pending` and `Cancelled`
  and nothing else, and one answer that says "already under way … · done" above "next: nothing —
  this conversion is finished" contradicts itself about whether anything is running.
- `convert_project` with a project (named or attached) starts it; with none it creates one — from
  a `repoUrl` as a cloud target, else from `deps.dir` as a LOCAL target whose origin is the
  directory itself — attaches, opens the session, and only then starts. A NAMED repository outranks
  the directory: a stdio connector always has one, so reading the directory first converted the
  caller's own working copy and dropped `repoUrl` and `branch` in silence.
- `proceed_conversion` carries a `ConversionDecision`; `conversion_status` renders the stage, the
  verdict, the estimates (always with the sentence saying an estimate is not a price) and a `next:`
  line derived from the STATUS first — `Awaiting` is a decision the user owes, `Waiting` is a
  question a person owes, and a UI that collapses them offers the wrong control for both.
- `purge_origin` requires `confirm: true` and refuses without it, spending no call: it deletes the
  origin sources and every reference to them, and cannot be undone. A REPAIR is refused rather
  than answered — nothing was filed away, so the origin is the project itself — and that refusal
  reaches the parent as its own sentence, never as the class it was thrown as (below).

**A conversion's model calls are the parent's by default, on any session-capable host and with no
add-on.** They arrive as ordinary `ModelTask` operations, which is why the `perform` loop queues
them whatever the llm mode says and why the two task tools are gated on `sessionCapable`. The
platform performs them only where nothing can hold a session — the URL host, the web application —
or where the account or project setting asks it to. The paid delegated capability is a different
question: it decides who performs the platform's own story and free-flight calls.

## The harness installer is idempotent by construction, and never writes the token

A section is replaced between `<!-- viable:begin -->` and `<!-- viable:end -->`, a JSON entry is
merged under its own key, and a file whose content would not change is skipped. An instruction file
belongs to its project: overwriting it to add a paragraph deletes whatever else was in it, and
appending unconditionally grows a duplicate on every install. That is what makes `install_harness`
safe to offer as a tool the agent may call whenever it is unsure. A configuration that is not valid
JSON is **refused** — somebody is editing it, and overwriting would destroy every other server they
had configured.

**No file it writes contains the token**: each configuration references `VIABLE_API_TOKEN` in its
harness's own syntax, so the result is safe to commit. `WORKING_RULE` is written once and rendered
into every harness's instruction file, so the four cannot drift into four different protocols.

## The executor is the publisher's job, on somebody's laptop

`makeLocalSlotExecutor(dir)` answers the platform's slot commands against a directory here. The
dispatcher is the publisher's, switch for switch: the platform's remote helpers parse the ANSWERS
and cannot tell whether a pod or a laptop produced one, so an ordinary failure comes back in the
same shape ("error text or null"), and only an unknown command — a protocol fault rather than a
project fault — escapes as an exception. Everything is resolved per call rather than closed over,
because a re-initialization replaces the tree under a running connector. The integrity verdict is
forgotten after every command that changes the tree.

Seven rules the local half adds, each learned from a defect:

- **`backendEnv` reads the root `.env` and `frontendEnv` the web package's own — the file split IS
  the leak boundary.** The publisher has an allow-list (`frontendEnvVars`/`frontendSecrets`); here
  the two files are never merged in either direction, because `FRONTEND_ENV_KEYS` announces
  everything in the frontend set to the bundler and a merge would compile `OIDC_SECRET` and
  `DATABASE_URL` into a bundle every visitor downloads.
- **`Discard` passes `git clean -fd -e .viable`.** `.viable/connect.json` is untracked until someone
  commits it, and a discard that swept it leaves a tree no later session can recognise as a platform
  project at all.
- **The always-keep list must not leave empty parent shells.** A wipe keeps `.viable`, `.env`, the
  web package's `.env` and `.git` whatever the caller asked, so a directory holding a kept path is
  walked and pruned rather than removed — and a keep that was not there (the web `.env` every
  project without local branding lacks) must not leave the walked directory behind as a skeleton the
  install then lands in.
- **An absolute path from elsewhere on the machine is re-rooted inside the project**, not refused —
  the publisher's own behaviour, kept deliberately and pinned by a test. Concatenating it onto the
  root instead builds a shadow tree: the write reports success, a later read of the same name
  resolves to the untouched original, and the change looks silently ignored. `resolveInProject`
  (exported as `confineToProject`) then compares the fully resolved path to the root — confinement,
  not sanitization, and applied on **every** fs call rather than a `..`-to-`.` replace at one caller.
- **`run/state.ts` sits below both the shell commands and the run**, so the three do not form a
  cycle: `DbSync` bounces the api child, `DbSync` is a shell command, and the shell commands are
  reached through the executor the run is built on. Everything that touches a child process lives
  there, and the run record is a file because the processes outlive the call — and, on a restarted
  connector, the process — that started them.
- **`SlotGitCommand.Clone` is REFUSED here, in the shape a caller already parses.** A clone exists
  for the platform fetching an origin onto a volume it owns; a local target has already answered
  that question — the directory the connector was started in IS the origin — and fetching over it
  would replace a developer's working copy, uncommitted work included. Answered as
  `{ cloned: false, branch: '', head: null, result: CLONE_REFUSAL }` beside `REMOTE_REFUSAL` and
  never thrown, because a caller that received an exception would retry something that can never
  succeed.
- **What a source LISTING hides is one shared constant.** `getSourceList` spreads
  `SOURCE_LIST_EXCLUSIONS` from `@owlmeans/viable-common` — the metadata directories plus
  `CONVERTED_ORIGIN_DIR` — rather than keeping a local copy. Three copies of that list is three
  chances for one of them to keep listing a converted project's origin, and the symptom is a coder
  helper reading a foreign framework's files as if they were the target's, and then editing them.

The four census/relocation commands are the same discipline in a new shape, and they are ONE
contract with three implementations — this executor, the publisher's `createFileHelper` and the
library's local helper — so wherever the three could disagree about one tree, the answer is a
shared constant rather than a matching local copy. `StatTree` walks bounded and reports `total`
(what it SAW) beside `entries` (what it returned), because a listing that reported only its own
length is indistinguishable from a small repository; it skips `CENSUS_SKIP_DIRS` (`node_modules`
and `.git`, from `@owlmeans/viable-common`) plus `CONNECT_MARKER_DIR`, and NOT the metadata a
source listing hides — a census is asked what the tree holds, and the only things it may hide are
what a package manager put there and the connector's OWN directory, which holds a key pair and a
run record rather than a line of the application. `dist`, `build` and `.next` are deliberately NOT
skipped: they are ordinary directory names an origin may keep sources in, and hiding them here
while the publisher walked them gave one repository two different totals depending on which
executor answered. The binary verdict is `binaryByExtension` first and a `BINARY_PROBE_BYTES` NUL
probe only where the tail says nothing — a probe alone reads a small `.ico` with no NUL in its head
as text, and the two executors then disagreed about the same file. Every entry's `path` is relative
to the directory ASKED FOR, which is the relativity the in-process helper and the publisher answer
too: a census follows its listing with a `readHead` of what it listed, and nothing downstream
knows which of the three executors produced the path it is holding. `ReadHead` reads the first
bytes of one file so a classification never holds an export in memory — clamped to
`CENSUS_MAX_HEAD_BYTES` and to the file's own size, because a caller asking for megabytes has
misunderstood the command rather than needed them — and answers `''` for anything it cannot read AS
a file — a directory (`open` succeeds on one and the READ then throws EISDIR), a path deleted since
the walk — because one unreadable entry must not fail the pass classifying the rest of the tree; a
path escaping the project is the one case that still raises, being a caller's bug rather than an
entry. `Relocate` is `emptyProject`'s walk with a different verb — the same nested keeps, the same
always-keep set, the same rule that a directory walked for a keep that was not there does not
survive as an empty shell — it resolves its destination BEFORE deriving the project-relative name
(normalizing the string first re-rooted an absolute destination into a shadow tree the keep set no
longer matched), it REFUSES a destination that already holds something, because interleaving two
trees leaves nothing able to tell which files came from where, and it reports the WHOLE keep set:
`kept` is what the relocation was told to leave alone, never a listing of what happens to be on
disk afterwards. `RemoveTree` refuses the project root: emptying the project is `emptyProject`,
which has a keep list this does not. All three mutating ones forget the integrity verdict.

The always-keep set is the one place the three implementations are allowed to differ, and the
difference is stated rather than inherited: the platform's two share `RELOCATE_ALWAYS_KEEP`
(`.git`, `sandbox-meta.json`, the rolling history) because they act on a volume the platform owns,
while this executor keeps `.viable`, `.env` and the web package's `.env` because it acts on a
directory the DEVELOPER owns and the platform provisions nothing there to re-derive them from.

## Attaching a session is what writes the project marker

`.viable/connect.json` is how a connector started in a directory tomorrow knows which project it
is, and `attach_project` finds a project by its directory through it. It was declared, read at MCP
startup and documented in `mcp.md` before anything wrote it — a marker nothing writes is a lookup
that always misses.

`openSession` writes it when the session names a project and a directory, which is the moment the
directory becomes that project's. Best-effort and idempotent: a session that works is worth more
than a note about it, and it is skipped when the marker already names the same project. It holds
no secret and is meant to be committed, which is why the API URL and the slug are in it and the
token never is.

Package installation always uses `bun install --force --backend=copyfile`. Local targets are
agent-writable, so Bun's default hardlinks would let a dependency edit mutate the machine cache and
poison later projects; the copy backend gives the project its own inodes, and `--force` prevents a
stale development cache from winning over the lockfile's package body.

## The managed block yields to every key the user assigned

A `.env` gives the LAST assignment of a key and the platform's block is appended, so a platform line
silently outranks whatever the user wrote above it. That made the documented promise — everything
outside the block is yours — false for the one value the platform cannot supply: `DATABASE_URL`, the
line the setup guide tells people to write. The application connected to the placeholder no matter
what its owner put in the file.

`writeEnv` therefore reads the file with the block cut out, and replaces any block line assigning a
key the user already assigns with a comment saying so. The rule is about VALUES, not lines: a key the
user has not claimed is still the platform's to set, and a key they later delete goes back to the
platform on the next push.

## The two services a local project needs are ASKED for, never assumed

The platform provisions nothing on somebody's own machine, so a database — and, for a project with a
worker, a queue store — is the one thing it cannot supply and must not guess. `local_setup_guide`
reports what the machine already provides and, where something is missing, returns a QUESTION with
three answers: the user already has one, wants one installed here, or wants a free hosted plan.
Guessing means either a container on somebody's machine they did not ask for, or a connection string
invented for a database that does not exist — and the second surfaces minutes later as a boot error
about a connection, which sends the reader looking for a database rather than for a typo.

`set_local_service` records what they answered: it writes the value into the project's own half of
the `.env`, replacing that key rather than appending a second copy, and PROBES it immediately, so a
string that does not connect is caught while the user is still in the conversation. A credential
never reaches the marker, a harness configuration, or the platform, and the guide warns when the
file is not git-ignored.

## A detached child outlives the connector, so the port is RECLAIMED before it is used

Every target process is spawned detached — that is what keeps a build from dying with the tool that
started it — and detaching is also why a connector killed mid-run (a host restart, a Ctrl-C, a
crashed test) leaves one alive. What survives holds port 3000, and the next attempt fails with the
TARGET's own "the api port is already in use", which reads as a defect in the generated app rather
than as a leftover.

Two rules, both ported from the publisher because a laptop needs them more than a pod does:
- `killGroupAndWait` never returns early on the child's own exit code. The child is a shell wrapping
  `bun`, so a signal the shell dies from leaves `bun` alive while `exitCode` says gone; the wait
  polls the GROUP instead of the child's exit event.
- `reclaimPort` runs before a spawn as well as after one, and matches on the script AND the process
  marker (`--viable-api`, `--viable-worker`, `--viable-boot-check`) — never a port alone, and never
  a marker alone, since reclaiming sends SIGKILL and a marker on its own matches any command line
  that merely mentions it.

## Running the generated app locally

`runLocal` builds and starts the api, the worker (when the project has one) and a local server that
holds the web port and proxies `/api` to the api process on the same origin — the generated app's
configuration assumes one origin, and splitting them across two loopback ports would put its CORS
setup in the path of a developer's first page load. There is no respawn ladder, no reconciler and no
health route: a developer watching their own terminal is the supervisor. What IS reproduced is the
shape — the same ports, the same argv marker, the same environment, and the same "port ownership is
the only proof" rule about restarts. Nothing from the publisher's public-hostname policy (robots,
CSP, the preview error reporter, the build-state header) is reproduced: a loopback address has no
reputation to spend and no crawler to answer.

`run_local` refuses to start a project whose `.env` is still missing a required key, because an app
launched without a database URL fails at boot with a message about a connection, which sends the
reader looking for a database that was never configured.

## Tests

`bun test ./tests` — offline: the two envelopes and their parsers (a confirm's two printed values
included, and that the parser takes them back; a Choice carrying no options rendered and parsed as
a text question), the shared queue's redelivery guard, the harness installer, the tool catalogue
(which host offers the task, question and conversion tools — the first two in BOTH llm modes on a
session-capable host and in neither on the URL one; the `next:` line a check answers with for a
conversion under way, parked, absent or refused; and the lead line it gives a conversion that has
ENDED), the platform catalogue's completeness against `ConnectJobKind` and the order its conversion
group names its tools in, the sentence a platform-billed session is given about a conversion's
calls and the one a host that can hold no session is given whatever its account setting says, the
refusal map (a marshalled refusal phrased by every conversion verb and through the MCP boundary,
an unknown marker falling back to itself, no marker shadowing a later one, and every phrase a
sentence), the executor's files/git/layout rules, and the marker + managed-`.env` block.

## Depends On

- `@owlmeans/viable-common` — the whole wire contract · `@owlmeans/auth-token` — the carrier guard
- `@owlmeans/api`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-config`,
  `@owlmeans/auth-common`, `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/socket`,
  `@owlmeans/config`, `@owlmeans/context`, `@owlmeans/error`, `@owlmeans/basic-ids`
- `@modelcontextprotocol/sdk` (types only, structurally), `zod`, `fs-extra`, `globby`, `ajv`

## Related

- [[viable-mcp]] — the npx stdio server built on this
- [[auth-token]] — the credential and its carrier guard
- [[llm-delegate]] — the other end of a model task, inside the platform
- [[inquiry]] — the other end of a question: the primitive a run asks with, and the ONE answer ceiling
