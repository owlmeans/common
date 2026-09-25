---
name: viable-sdk
description: How to use @owlmeans/viable-sdk — the connector SDK an external coding agent drives the OwlMeans Viable platform with — the token-authenticated client context, the two host kinds and their tool catalogue, the session operation loop, the local slot executor and local run, the model-task envelope, and the harness installer. Auto-invoked when building or changing a connector, an MCP host, a connector tool, the task envelope, or anything that executes platform slot commands on a developer's machine.
user-invocable: false
---

# @owlmeans/viable-sdk

**Layer:** Tooling (Node/Bun; not a browser or React package)
**Install:** `"@owlmeans/viable-sdk": "^0.1.18-rc.33"` in `dependencies`
**Subpaths:** `.` · `./executor` · `./run` · `./tools` · `./task` · `./harness`
**Contracts:** `@owlmeans/viable-common` (`./connect`, `./slot`, `./integrity`, and the planning
vocabulary — story type and story flow) and `@owlmeans/planning` (the planning protocol tree
and facade) — every name on the wire is declared there, so the SDK and the platform cannot spell one
differently.

Everything a coding agent needs in order to drive the platform: authenticate with one access token,
attach a session to a project, execute the platform's slot commands against a directory on this
machine, deliver its model calls to the parent agent, and run the generated application locally.
`@owlmeans/viable-mcp` is one host built on it.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeSdkContext({ apiUrl, token, service?, onRejected? })` | A client context authenticated by one token — a literal or a thunk — with the connector protocols and the planning tree bound and the planning client registered |
| `makeRemoteConnectorApi(context)` | `ConnectorApi` over HTTP; its `planning` is the context's planning client facade |
| `openSession(opts)` → `SessionRuntime` | One attached session: the operation loop, the task queue, `stats` |
| `renderTaskEnvelope(task, { harness })` · `parseTaskResult(task, raw)` | What the parent agent is told; what its answer is checked against |
| `makeModelTaskDriver({ models })` · `TaskDriver` | A reference parent agent backed by a chat model (tests, CLIs) |
| `installHarness(dir, harness, opts?)` · `describeHarness(harness)` · `WORKING_RULE` | Set a coding agent up; preview it first |
| `catalogue` · `visibleTools(host)` · `toolByName` · `registerCatalogue(server, deps)` · `serverInstructions({ host })` | The tools and how they reach an MCP server |
| `renderProjectStatus`, `renderStoryStatus(status, { landing? })`, `renderPipelineStatus`, `conversionNext` | Domain status as concise lines ending in the next valid action |
| `resolveStory(deps, projectId, ref)` · `storyQuery(projectId, filter?)` · `renderStories(items, page, total)` · `STORY_ORDER` · `isLandingStory(card)` · `LANDING_MARK` · `LANDING_NOTE` | The story tools' reading of planning cards |
| `PROJECT_SETTINGS` · `projectSettingOf(key)` · `settingsPatch(args)` · `renderProjectSettings(projectId, settings)` · `settingsReach(target)` | The project-settings tools: each setting's label and rule, the patch a call asks for, the rendering |
| `PLATFORM_CATALOGUE` (`pipelines`, `features`, `capabilities`) · `renderPlatform(catalogue, host)` · `GENERATED_SUMMARY` | What `describe_platform` renders, and the one-sentence product summary `describe_capabilities` ends with |
| `ToolHostKind` (`Stdio`/`Http`) · `ToolHost` · `ToolDeps` · `anyHost`/`localTarget`/`cloudTarget`/`withExecutor`/`delegatedLlm`/`sessionCapable`/`performsModelTasks` | The host description and the availability predicates |
| `./executor`: `makeLocalSlotExecutor(dir, opts?)`, `createLocalFileHelper`, `createLocalShellHelper`, `dispatchGitCommand`, `verifyTarget`/`forgetIntegrity`, `targetPaths`/`apiPath`/`webPath`/`workerPath`, `backendEnv`/`frontendEnv`, `classifyTargetHealth`/`readTargetHealth`, `runBootCheck`, `confineToProject`, the spawn helpers | The publisher's workload, on somebody's laptop |
| `./run`: `runLocal`, `stopLocal`, `localStatus`, `createLocalServer`, `startApi`/`startWorker`/`restartApi`/`stopProcess`, `readRun`/`writeRun`/`clearRun` | Building and running the generated app locally |
| `readMarker`/`writeMarker`/`discoverProject`/`isViableTree` · `readEnv`/`writeEnv`/`envStatus`/`replaceManagedBlock` | The `.viable/connect.json` marker and the managed `.env` block |
| `SdkError`, `SdkAuthError`, `SdkMisconfigured`, `SdkUnsupported` | Registered `ResilientError` classes |
| `ENV_TOKEN`, `ENV_API_URL`, `ENV_MCP_URL`, `ENV_TARGET`, `ENV_LLM`, `ENV_HARNESS`, `ENV_PROJECT_DIR` · `DEFAULT_MCP_URL` · `resolveMcpUrl(values)` · `TOOL_DEADLINE_MS` (45 s) · `COMMIT_WAIT_MS` (20 s) · `COMMIT_POLL_SEC` · `STORY_PAGE_SIZE` · `NEXT_TASK_WAIT_MS` · `PULL_WAIT_MS` | Configuration and deadlines |

## One credential, and the routes the server declares

`makeSdkContext` registers `makeTokenCarrierGuard` under `DEFAULT_GUARD` and binds the SAME
immutable `connectProtocols(...)` tree the server mounts, so a path or a schema cannot be right on
one end and wrong on the other. The planning tree is bound the same way:
`makePlanningProtocols({ base: { alias: 'viable:manager-api:planning', path: '/planning' }, guards:
DEFAULT_GUARD, socketBase: <the /update base> })` — manager-api's mount minus its ownership gate, which
is the server's to apply — followed by `appendPlanningClient(context, { protocols, bind: false, poll:
COMMIT_POLL_SEC, timeout: TOOL_DEADLINE_MS, schemas: false })`. The base alias and path are literals
beside the `/update` base for the same reason that one is: they belong to manager-api, and every
planning alias and path derives from them. No socket opener is passed, so a commit is awaited by long
poll only, and the schema bundle is not fetched at startup — nothing a tool does reads a flow, and a
server nobody has asked anything yet makes no call. There is deliberately **no second credential path**: a connector that could
fall back to another form of authentication is a connector whose access nobody can revoke by
revoking a token. A literal token that is empty or lacks `CONNECT_TOKEN_PREFIX` is refused locally
(`SdkMisconfigured` / `SdkAuthError`), because a 401 says nothing about which of several plausible
mistakes was made and the answer is always the same one.

**`token` may be a thunk** (`() => string | Promise<string>`), resolved on every request — what a
credential holder (`@owlmeans/cli-auth`) hands over, since it is `''` until a browser sign-in
completes and a real token after, with no reconfiguration. Only a literal is validated eagerly; a
thunk's value is unknown at construction, and an empty one is simply "not signed in". `onRejected`
is passed to the carrier guard and fires when the platform 401s the presented token, which is where
the holder forgets a dead file token (or reports a dead environment one) — see [[auth-token]].

**The `/mcp` URL is a value the SDK resolves, never one it derives:** `resolveMcpUrl(values)` returns
`values[ENV_MCP_URL]` (`VIABLE_MCP_URL`, empty = unset) else `DEFAULT_MCP_URL`
(`https://api.owlmeans.com/mcp`), trailing slash dropped so a resource URI has one spelling. The
caller passes the already merged environment + `~/.owlmeans` values (environment wins). A deployment's
own resource identifier stays host-derived on the server.

**The context must also declare the platform's `/update` base itself.** The connector's socket route
and the planning commit feed hang under that namespace, and a parent an entrypoint registry cannot resolve fails the **whole
context at init** rather than the one call that would have used it — a server that exited at startup
with `Entrypoint viable:manager-api:update:base not found`. It is declared with the path the
platform declares and never binds: it is a namespace, and nothing calls it.

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

## A SESSION belongs to a host that stays; `sessionCapable` is what says so

A session is a connector ATTACHED — a process that drains the project's operations and holds a model
task until its answer comes back. The URL-configured host answers one request and forgets, so
opening one there would claim the project's single connector slot, **supersede the stdio connector
legitimately holding it**, and be abandoned before the first operation was delivered.

So `ensureSession` — what `confirm_project`, `reinitialize_project`, `develop_story`,
`modify_project` and `resume_pipeline` call before returning their job — opens one only on a
`sessionCapable` host, and `next_task`/`submit_task_result` are available on `performsModelTasks`
(delegated **and** session-capable) rather than on the account setting alone. `serverInstructions`
reads the same predicate: a parent told to call `next_task` when the tool is not in its list is a
parent that waits for a run nobody will advance. A host that cannot serve the delegated mode says so
in one sentence instead, naming the stdio connector.

The in-process implementation refuses the five session verbs (`openSession`, `closeSession`,
`heartbeat`, `pullOps`, `submitOp`) with a message naming `@owlmeans/viable-mcp`, because
"unsupported" alone leaves the reader with nothing to do about it.

## A tool that cannot work in a mode is HIDDEN, not failing

`ToolDefinition.availability` and `visibleTools(host)` decide the catalogue a parent actually sees. A
tool a host cannot serve is a tool the parent tries once, is refused, and remembers as broken — so
the list it reads is exactly the set of things that work for it. Predicates: `anyHost`,
`localTarget`, `cloudTarget`, `withExecutor`, `delegatedLlm`.

## 45 seconds is the ceiling, so long operations return domain status

Every MCP host bounds a tool call and the strictest default in the field is sixty seconds (Codex).
`TOOL_DEADLINE_MS` leaves room for the round trip and keeps the connector inside every host's
ceiling without configuration. A tool that outlives its host's ceiling is reported to the user as a
**broken server**, and the true answer — the platform was slow — never reaches them.

Anything that takes minutes returns the owning domain's status and continues server-side.
`project_status`, `story_status`, `conversion_status` and `pipeline_status` compose the durable
records and run state a parent needs. `registerCatalogue` enforces the deadline per call and
converts a throw into an `isError` result the model can read and act on, because an exception
crossing the transport tells it only that something went wrong somewhere. Each status renderer
ends with a single `next:` line so the parent follows the domain workflow and does not invent a
polling strategy or treat a parked run as failed.

## The story tools speak planning

A user story is a planning CARD of `VIABLE_STORY_TYPE` under its project card, and every change to one
is a transition executed through `ConnectorApi.planning` — a `PlanningFacade`: the client facade
`appendPlanningClient` registers over HTTP, and `ensurePlanningService(ctx).for(scope)` in the
platform's in-process host. The scope a call answers for is the CREDENTIAL's; a tool sends none.

| Tool | Facade call |
|---|---|
| `list_stories` | `cards.list({ ...storyQuery(project, { status, area }), page, size, sort: STORY_ORDER })` → `renderStories` |
| `search_stories` | the same with `{ q }` |
| `create_story` | `execute({ action: create, card: { kind: card, type: VIABLE_STORY_TYPE, parent, title, fields: { primary: false } } }, { wait: true, timeout: COMMIT_WAIT_MS })` |
| `update_story` | `resolveStory` → `execute({ card, action: update, changes: { title }, expectSeq: head ?? seq }, { wait: true, … })` |
| `delete_story` | `resolveStory` → `execute({ card, action: delete }, { wait: true, … })` → the project-lock poll |
| `develop_story` | `resolveStory` → `execute({ card, action: transit, transition: start }, { wait: true, … })`, tolerating `CommitTimeout` → `story.status(project, card.id)` |
| `story_status` | `resolveStory` → the card, its development run, pending inquiry, warning and landing mark |

Rules the table rests on:

- **A tool NAME is a parent agent's vocabulary and is never renamed**, and neither is an argument:
  `storyId` stays `storyId` although the platform keys on card ids. New facts are added (`designSystem`
  on `confirm_project`, the project status line and the design-system section of `project_status`),
  never substituted.
- **`storyId` accepts a code or an id**, because `list_stories` prints the CODE — the handle every
  generated file names a story by. `resolveStory` asks for both at once, the id wins, a code is also
  tried uppercased, and neither answers for a story of another project (`ProjectStoryNotFound`).
- **Development is the story's `start`, not a call of its own.** The platform begins the run once that
  move COMMITS, and refuses it there too (the flow, one story in progress, the balance). The wait is
  `COMMIT_WAIT_MS`, well inside the tool deadline; a late commit is not a failure — the transition is
  durable — so `develop_story` answers from `story_status` rather than outliving the host's ceiling.
- **A story a person writes goes as written, with no area.** Re-formatting the narrative and deciding
  the area are the platform's, done in its planning middleware for the `connect` channel; a connector
  that guessed an area would be a second answer. `update_story` carries only `title` and the head it
  read, so a change made in between is refused (`WorkcardConflict`) rather than overwritten.
- **The delete commit is no proof the slot is done.** It says the card is gone and nothing about the
  placeholder screens still being retired under the project lock, so `delete_story` keeps its two
  unlocked observations.
- **Stories are read in `order`, then `createdAt`**: `order` is the analysis's flow ordinal (a
  connective story sits at a fraction between two steps). `renderStories` keeps the line shape a parent
  already reads — `code · status[ · primary][ · landing gate][ · area]` over the narrative — under a
  header counting the page by intrinsic state. A new fact is a new FLAG beside `primary`; the area
  stays last.
- **The landing gate story is read off the card the tool already holds** (`fields.landing`, at most
  one per project, decided by the platform at initialization — a connector never sets it). The list
  flags it; `story_status` and `develop_story` pass the resolved card to `renderStoryStatus`, which
  adds `LANDING_NOTE` under the status line, and their structured result gains `landing: true`. No
  second call and no change to `connect.story.status`: that route carries the run, not the card's
  fields. It is said because developing that story also replaces the guest-home sketch with the real
  component, which the narrative alone never tells a parent.
- **A planning refusal is phrased like any other**: `planning:illegal-transition:`,
  `workcard-conflict:`, `workcard-not-found:`, `fields-invalid:`, `commit-timeout:`, `commit-failed:`
  and the story markers (`viable-project:story:not-found:` / `:missconfigured:`) each have a sentence in
  `REFUSALS`.

- **A sign-in refusal is phrased**: `oauth:sign-in-required:` (detail `<url> <code>`, the code absent
  while no device sign-in is pending), `oauth:token-rejected:` (an environment token that was refused
  is never replaced) and `api:auth:guard:auth-token` (a file token the platform refused — forgotten,
  the next call signs in). Each ends with "call this tool again".

## The project settings are ONE record, and the platform is the only validator

`project_settings` and `update_project_settings` read and change what a person edits on the project's
control panel — the copyright line, the organization name, the Terms and Privacy links and the Google
tag — through `ConnectorApi.projectBranding(projectId)` and
`saveProjectBranding(projectId, patch)` (`connect.project.branding.get` / `.save`,
`ConnectProjectBranding` / `ConnectProjectBrandingSave` from `@owlmeans/viable-common`).

- **A save is a PATCH.** `settingsPatch` keeps exactly the settings the call named, trimmed; an
  omitted one keeps its stored value, and an EMPTY string is sent as given — for the Google tag that
  is the removal, for the others a value the platform refuses. A call naming none is refused locally
  and saves nothing. The answer is the merged record the platform stored, led by where the change
  shows (`settingsReach`): a cloud preview is rebuilt, production takes it at the next Publish; a
  local project gets it in its `.env` and `run_local` builds with it.
- **The connector states the rules and checks none of them.** `PROJECT_SETTINGS[].rule` is the web
  save's validation in words — never-empty copyright and organization; an `https://` address without
  credentials or a single-slash path on the application (`/terms`, `/privacy` are the generated
  pages); a `GTM-`/`G-`/`GT-`/`AW-`/`DC-` id or `''` — used by the tool description and by the
  refusal. A second copy of the check would be a second answer that drifts from the platform's.
- **A refusal names the setting and its rule.** The platform refuses a field with
  `AuthenPayloadError(<wire field>)`; the `authen:payload:` phrase answers a known setting with its
  label and rule and "Nothing was changed", any other field with a generic sentence. The tool runs in
  `answering`, so the refusal is its own `isError` result and is still logged.
- **The save attaches the connector first** (`ensureSession`), like a story mutation: it ends in the
  platform's configuration push, which for a local project is a `Configure` operation this connector
  answers.
- **A relative link is annotated, never "fixed"**: `/terms` renders as "the generated Terms page", so
  a parent does not rewrite it into an absolute address that points away from the generated page.
- **The credit switch is not reachable.** It is a paid capability with its own gated route;
  neither the record nor the patch carries it.

## `describe_platform` also says what a generated application CARRIES

`PLATFORM_CATALOGUE.features` holds facts about the product the runs produce — the landing gate, the
generated Terms and Privacy pages, the consent-gated Google tag, the look, production builds without
preview scaffolding — rendered whole on every host under "WHAT A GENERATED APPLICATION CARRIES", with
only their `tools` narrowed to what the host offers. A parent that is not told the platform generates
the legal pages writes its own beside them. `describe_capabilities` ends with `GENERATED_SUMMARY`, the
same facts in one sentence, because it is read at the same moment by a parent that may never call
`describe_platform`; the two sit side by side in `platform.ts`. The pipelines' `stages` name the steps
a run can stop at (`landing` and `legal` in init, `landing` in story development).

## A balance or consent refusal is phrased for a person, and pushed through `notify`

`registerCatalogue`'s catch special-cases the two refusals only a PERSON can resolve
(`@owlmeans/viable-common` `connect/errors.ts`), by `instanceof`:

- `ConnectOutOfCredits` — rather than the raw `viable-connect:out-of-credits:...` marker, the tool
  result reads as a sentence: what it needed, what the account has, and a link to top up.
- `ConnectConsentRequired` — the EU spend consent: "Nothing was started", why (credits bought less
  than 14 days ago may only be used once a person expressly asks, the purchase still withdrawable up
  to the last day), the `consentUrl` to open and confirm in the browser, and that the call must NOT
  be retried automatically — only after the user says they confirmed (`consentRequiredPhrase(url,
  deadline)` in `tools/refusal.ts`, shared with the stored-text entry below).

Their fields travel packed into the message (only `type` and `message` survive the platform's
internal HTTP hop) and are read back with `finalizeUnmarshal()`. Both are also handed to the
optional `ToolDeps.notify?('warning', text)`, which a host wires to its own out-of-band channel —
the stdio `viable-mcp` host sends an MCP `notifications/message`; the platform's stateless `/mcp`
host has no channel and omits it, so `notify` is always best-effort and optional. Every other
error returns through `refusalPhrase` and never calls `notify`.

The same refusals also arrive where no class survives, and `REFUSALS` phrases them by marker:
`viable-connect:consent-required:` (a stored run error; the URL and deadline parsed from the
detail), `performance-consent-required` (the web refusal inside a planning `commit-failed:` or a
stored error — no URL, so "Billing in the OwlMeans web application") — both ABOVE the planning
markers, because the consent is what the person acts on — and, for a production body that carries
only an incident id (`@owlmeans/api` `ApiStatusError`), `api:client:status:428` (the consent
sentence) and `api:client:status:402` (the balance sentence).

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

`TaskQueue` therefore remembers every task id it has handed over and ignores a second delivery of
one, keeping the memory after the task settles so a redelivery that raced the platform's deletion
is ignored rather than answered again. The operation id IS refreshed on a redelivery, because the
answer must route to the operation the platform is currently waiting on. `push` returns whether the
task was accepted, and `tasksDelivered` counts only accepted ones — a counter that grew per poll
would make a stuck run look busy.

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

For Codex, the parent gives a fresh `viable-worker` only the task's system prompt, then its
conversation, then the requested result shape: the outer handoff instruction and
`submit_task_result` call are parent-only. It passes that final response through unchanged, but must
preserve the mode: a `text` task returns the requested source or text and never a JSON tool-call
array; that array belongs only to `tools` mode.

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

## The harness installer is idempotent by construction, and never writes the token

A section is replaced between `<!-- viable:begin -->` and `<!-- viable:end -->`, a JSON entry is
merged under its own key, and a file whose content would not change is skipped. An instruction file
belongs to its project: overwriting it to add a paragraph deletes whatever else was in it, and
appending unconditionally grows a duplicate on every install. That is what makes `install_harness`
safe to offer as a tool the agent may call whenever it is unsure. A configuration that is not valid
JSON is **refused** — somebody is editing it, and overwriting would destroy every other server they
had configured.

**No file it writes contains the token**, and none REQUIRES one: a person who signed in with a browser
has the token in `~/.owlmeans`, which the server reads itself. So each configuration references
`VIABLE_API_TOKEN` in its harness's own syntax only where that cannot break a machine that never set
it — claude-code's `.mcp.json` uses `${VIABLE_API_TOKEN:-}` (an unset `${VAR}` makes Claude Code refuse
the whole file; the server ignores the empty value), Copilot's `.vscode/mcp.json` has no token prompt
at all, and Codex's `env_vars` lists `VIABLE_API_TOKEN`, `OWLMEANS_CREDENTIALS` and `HOME` (its filtered
environment otherwise hides the credentials file). The result is safe to commit. `WORKING_RULE` is written once and rendered
into every harness's instruction file, so the four cannot drift into four different protocols.

**The server command is written once, too.** Every harness configuration starts the connector from
`MCP_COMMAND` in `src/harness/templates.ts` — viable-mcp through `npx -y`, pinned with a caret at the
viable-mcp release, on ONE line with its `npx` so the release pin audit reads it as an install
command and moves it with every viable-mcp bump. Never a tag (`@next` is refused by that audit) and
never a per-harness literal: three copies spelled `@next` while the fourth carried the pin.
`tests/harness.spec.ts` asserts all four configurations name the viable-mcp manifest's version, that no
file contains a `vib_…` secret, and the optional-token shapes above.

## The executor is the publisher's job, on somebody's laptop

`makeLocalSlotExecutor(dir)` answers the platform's slot commands against a directory here. The
dispatcher is the publisher's, switch for switch: the platform's remote helpers parse the ANSWERS
and cannot tell whether a pod or a laptop produced one, so an ordinary failure comes back in the
same shape ("error text or null"), and only an unknown command — a protocol fault rather than a
project fault — escapes as an exception. Everything is resolved per call rather than closed over,
because a re-initialization replaces the tree under a running connector. The integrity verdict is
forgotten after every command that changes the tree.

Five rules the local half adds, each learned from a defect:

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

`bun test ./tests` — offline: the envelope and its parser, the harness installer, the tool catalogue,
the `registerCatalogue` out-of-credits, consent and planning-refusal phrasing and `notify` wiring
(`mcp-catalogue.spec.ts`; the consent marker, the bare 428/402 statuses and a consent inside a
commit failure in `catalogue.spec.ts`), the executor's files/git/layout rules, and the marker + managed-`.env`
block. The story tools run over a REAL `@owlmeans/server-planning` service (memory store, the Viable
types and flows, one plugin standing in for the platform's format seam) built in `tests/context.ts`,
the landing mark included; the settings tools over a recorded `ConnectorApi` (order of session and
save, the patch sent, the phrased `AuthenPayloadError`). `platform.spec.ts` pins that every tool a
pipeline, feature or group names exists and every tool is in a group; `planning-wiring.spec.ts` pins
the planning aliases and paths a context binds, and `remote.spec.ts` drives the remote facade and the
settings routes through a captured transport to pin their paths and deadlines.

## Depends On

- `@owlmeans/viable-common` — the whole wire contract · `@owlmeans/auth-token` — the carrier guard
- `@owlmeans/planning` — the protocol tree, the facade contract and its refusals ·
  `@owlmeans/client-planning` — the remote facade and the long-poll commit wait
- `@owlmeans/api`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-config`,
  `@owlmeans/auth-common`, `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/socket`,
  `@owlmeans/config`, `@owlmeans/context`, `@owlmeans/error`, `@owlmeans/basic-ids`
- `@modelcontextprotocol/sdk` (types only, structurally), `zod`, `fs-extra`, `globby`, `ajv`

## Related

- [[viable-mcp]] — the npx stdio server built on this
- [[auth-token]] — the credential and its carrier guard
- [[client-planning]] · [[planning]] — the facade the story tools write through
- `@owlmeans/llm-delegate` (`internal` monorepo, skill `llm-delegate`) — the other end of a model
  task, inside the platform
