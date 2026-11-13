---
name: viable-sdk
description: How to use @owlmeans/viable-sdk — the connector SDK an external coding agent drives the OwlMeans Viable platform with — the token-authenticated client context, the two host kinds and their tool catalogue, the client header every request names its edition with, the session operation loop and its model-task seam, the local slot executor and local run, the model-task envelope, the extension seam a host adds its own tools through, and the profile seam that presents the catalogue for a store listing or a plugin (the listing profiles). Auto-invoked when building or changing a connector, an MCP host, a connector tool, a tool profile, the task envelope, or anything that executes platform slot commands on a developer's machine.
user-invocable: false
---

# @owlmeans/viable-sdk

**Layer:** Tooling (Node/Bun; not a browser or React package)
**Install:** `"@owlmeans/viable-sdk": "^0.2.0-alpha.2"` in `dependencies`
**Subpaths:** `.` · `./executor` · `./run` · `./tools` · `./task`
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
| `makeSdkContext({ apiUrl, token, service?, timeout?, llm?, client?, onRejected? })` | A client context authenticated by one token — a literal or a thunk — with the connector protocols and the planning tree bound, the planning client registered (`timeout` is its HTTP deadline) and the call-collect transport in front of the API client (`llm: ConnectLlm.Local` turns collection on; `client` is the edition every request names, `sdk` when absent) |
| `createCallCollectTransport({ delegated, client? })` → `CallCollectTransport` (`.client` — the header value) · `appendCallCollectTransport(context, opts)` · `CallCollectOptions` · `CollectedCall` | The context's HTTP transport (`transport:http`): request now, collect later in the delegated mode |
| `makeRemoteConnectorApi(context, { timeout? })` · `RemoteConnectorOptions` | `ConnectorApi` over HTTP; its `planning` is the context's planning client facade; `timeout` bounds every request but the session verbs' (one request — a collected call's hops carry their own) |
| `openSession(opts)` → `SessionRuntime` (`nextTask(waitMs, signal?)`, `taskAvailable(waitMs, signal?)`, …) | One attached session: the pull loop, the serial worker, the task queue, `stats`; `modelTasks: false` refuses model tasks instead of queueing them |
| `createInflightCalls()` → `InflightCalls` · `makeHandoverHelper(deps)` → `HandoverHelper` (`run`/`contain`/`collect`/`report`/`pending`) | The delegated mode's handover: the calls still running after their tool answered, and how a blocked tool answers with its model task |
| `makeTaskEnvelopeModel(task)` — `.renderTaskEnvelope({ harness })` · `.parseTaskResult(raw)` | What the parent agent is told; what its answer is checked against |
| `makeModelTaskDriver({ models })` · `TaskDriver` | A reference parent agent backed by a chat model (tests, CLIs) |
| `ToolHost.extensions` · `EXTENSION_TOOLS` | Tools the hosting process adds beyond the catalogue (the agent-setup pair `describe_harness` / `install_harness` is one such extension, shipped outside this package); listed, filtered by their own `availability` and registered like the catalogue's own |
| `catalogue` · `catalogueHelper` (`.visibleTools(host)` · `.toolByName`) · `registerCatalogue(server, deps)` · `serverInstructions({ host })` · `instructionsHelper.compose(host, { namesOf?, recommend? })` | The tools, how they reach an MCP server, and the base instructions a profile composes its own from |
| `ToolProfile` (`ToolSplit`, `ToolSplitVariant`, `ToolPresentation`, `ToolProfileText`) · `makeToolProfileModel(profile?)` (`apply`/`namesOf`/`presentationOf`/`answer`/`text`) · `makeListingProfile(opts)` · `listingProfile` · `claudeListingProfile` · `openaiListingProfile` · `localPluginProfile` · `LISTING_HIDDEN` | The profile seam and the listing profiles (below) |
| `READ_ONLY` · `WRITE` · `IDEMPOTENT_WRITE` · `DESTRUCTIVE` | The public annotation presets, from the root and `./tools` |
| `statusTextHelper` — `.renderProjectStatus`, `.renderStoryStatus(status, { landing? })`, `.renderPipelineStatus`, `.renderBatchStatus`, `.renderClient(view)`, `.conversionNext` | Domain status as concise lines ending in the next valid action |
| `controlToolHelper` — `.stopNeedsConfirm`, `.unconfirmedStop`, `.unconfirmedCancel`, `.renderStop`, `.renderSteer`, `.renderCancel` | The agent controls' words: what a stop rolls back, what a steering message does |
| `storyHelper` — `.resolveStory(deps, projectId, ref)` · `.storyQuery(projectId, filter?)` · `.renderStories(items, page, total)` · `.isLandingStory(card)`; `STORY_ORDER` · `LANDING_MARK` · `LANDING_NOTE` | The story tools' reading of planning cards |
| `PROJECT_SETTINGS` · `settingsHelper` — `.projectSettingOf(key)` · `.settingsPatch(args)` · `.renderProjectSettings(projectId, settings)` · `.settingsReach(target)` | The project-settings tools: each setting's label and rule, the patch a call asks for, the rendering |
| `PLATFORM_CATALOGUE` (`pipelines`, `features`, `capabilities`) · `renderPlatform(catalogue, host)` · `GENERATED_SUMMARY` | What `describe_platform` renders, and the one-sentence product summary `describe_capabilities` ends with |
| `ToolHostKind` (`Stdio`/`Http`) · `ToolHost` (`client?`, `profile?` beside `extensions?`) · `ToolDeps` (`detach?`, `release?`, `inflight?` beside `attach`) · `ToolAnnotations` · `toolHostHelper` (`anyHost`/`localTarget`/`cloudTarget`/`withExecutor`/`delegatedLlm`/`sessionCapable`/`performsModelTasks`/`readsDisk`/`uploadsMaterials`) | The host description and the availability predicates |
| `materialsToolHelper` (`inputsOf`/`precheck`/`send`/`renderOutcomes`/`renderCatalogue`/`renderText`/`reasonPhrase`) · `MaterialOutcome` · `MaterialsUploadOptions` | A new project's files: the disk read, the precheck against `MATERIALS_UPLOAD_POLICY`, the send-and-seal, the words |
| `./executor`: `makeLocalSlotExecutor(dir, opts?)`, `createLocalFileHelper` (the publisher's file commands, `writeBinaryFile`/`readBinaryFile` included), `createLocalShellHelper`, `makeLocalGitHelper(dir).dispatchGitCommand`, `integrityHelper` (`verifyTarget`/`collectTargetFiles`/`readTargetFiles`/`forgetIntegrity`), `makeLayoutHelper(dir)` (`targetPaths`/`apps`/`apiPath(app?)`/`webPath(app?)`/`workerPath`), `makeTargetEnvHelper(dir)` (`backendEnv(app?)`/`frontendEnv(app?)`), `healthHelper` (`classifyTargetHealth`/`readTargetHealth`), `runBootCheck`, `confineToProject`, `spawnHelper` | The publisher's workload, on somebody's laptop |
| `./run`: `makeLocalRunHelper(dir)` (`runLocal`, `stopLocal`, `localStatus`), `createLocalServer(getWebDir, { apiPort?, apps? })`, `makeRunStateHelper(dir)` (`startApi(env?, app?)`/`startWorker`/`restartApi(app?)`, `readRun`/`writeRun`/`clearRun`), `runProcessHelper.stopProcess` | Building and running the generated app locally — every app of a split project on the one web port |
| `makeMarkerHelper(dir)` (`readMarker`/`writeMarker`/`discoverProject`/`isViableTree`) · `makeProjectEnvHelper(dir)` (`readEnv`/`writeEnv`/`envStatus`) · `dotenvHelper.replaceManagedBlock` | The `.viable/connect.json` marker and the managed `.env` block |
| `SdkError`, `SdkAuthError`, `SdkMisconfigured`, `SdkUnsupported` | Registered `ResilientError` classes |
| `ENV_TOKEN`, `ENV_API_URL`, `ENV_MCP_URL`, `ENV_TARGET`, `ENV_LLM`, `ENV_HARNESS`, `ENV_PROJECT_DIR` · `DEFAULT_MCP_URL` · `resolveMcpUrl(values)` · `TOOL_DEADLINE_MS` (45 s) · `HANDOVER_WAIT_MS` (40 s) · `COMMIT_WAIT_MS` (20 s) · `COMMIT_POLL_SEC` · `STORY_PAGE_SIZE` · `NEXT_TASK_WAIT_MS` · `PULL_WAIT_MS` | Configuration and deadlines |

## One credential, and the routes the server declares

`makeSdkContext` registers `makeTokenCarrierGuard` under `DEFAULT_GUARD` and binds the SAME
immutable `connectProtocols({ guard })` tree the server mounts (on the platform's public API host),
so a path or a schema cannot be right on one end and wrong on the other. The planning tree is bound
the same way: `makePlanningProtocols({ base: { alias: 'viable:manager-api:planning', path:
'/planning' }, guards: DEFAULT_GUARD, socketBase: <the /update base> })` — the platform's mount minus
its ownership gate, which is the server's to apply — followed by `appendPlanningClient(context, {
protocols, bind: false, poll: COMMIT_POLL_SEC, timeout: opts.timeout ?? TOOL_DEADLINE_MS, schemas: false })`. The
base alias and path are literals beside the `/update` base for the same reason that one is: they
belong to the platform, and every planning alias and path derives from them. The aliases are this
context's registry keys only; the wire is the path, which is why the platform may register its copy
under aliases of its own. No socket opener is passed, so a commit is awaited by long
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

**Every request names its edition — in a header, never in a body.** The call-collect transport
(below) writes `x-viable-client: <kind>[/<version>]` (`connectClientHelper.format`, `viable-common`)
on EVERY request it handles — connector routes and planning alike, every collect hop, in every llm
mode — and drops any other spelling of the header first, so the platform reads exactly one value.
The edition is `SdkContextOptions.client`; a host built on the SDK names itself
(`viable-mcp/<version>`), and a context that names nothing says `sdk`. It is formatted once per
context. A body field would be refused by an older platform (the session open body is closed) and
an older platform ignores an unknown header, so the header is what crosses the version skew.

**The `/mcp` URL is a value the SDK resolves, never one it derives:** `resolveMcpUrl(values)` returns
`values[ENV_MCP_URL]` (`VIABLE_MCP_URL`, empty = unset) else `DEFAULT_MCP_URL`
(`https://api.owlmeans.com/mcp`), trailing slash dropped so a resource URI has one spelling. The
caller passes the already merged environment + `~/.owlmeans` values (environment wins). A deployment's
own resource identifier stays host-derived on the server.

**The context must also declare the platform's `/update` base itself.** The planning commit feed
hangs under that namespace (the SDK never opens it), and a parent an entrypoint registry cannot
resolve fails the **whole context at init** rather than the one call that would have used it — a server that exited at startup
with `Entrypoint viable:manager-api:update:base not found`. It is declared with the path the
platform declares and never binds: it is a namespace, and nothing calls it.

**`cfg.webService` names the API CLIENT, never the backend.** It is the alias the entrypoint handler
looks up with `context.service(...)`, and the only thing registered under it is the `ApiClient` that
`makeClientContext` appends (`web-client`). Naming the backend service there — which is exactly what
`addWebService` does — makes every call fail with `Service <backend> not found` before a request is
sent. The backend belongs in `cfg.services` as an ordinary descriptor marked `default: true`; the
connect routes name no service of their own, so that is the one they resolve to. Its host is `apiUrl`,
the platform's PUBLIC API origin (path-less: the connector tree, planning, `/mcp`, OAuth); its alias
(`service`, default `viable-manager-api`) is a registry key of this context only, never on the wire.

**A POST with nothing to say still sends `{}`.** The client sets no `Content-Type` for an absent
body, and Fastify answers **415 Unsupported Media Type** before the handler runs — an error about
media types for a call whose only fault was having no arguments. `makeRemoteConnectorApi` fills an
empty body for any POST route that was given none; `session.close` is exactly that shape.

## Two hosts, one interface

`ConnectorApi` is an interface because two implementations must stay interchangeable — one calling
the API over HTTP (`makeRemoteConnectorApi`, the npx server) and one calling the platform's own
handlers in process (`makeInProcessConnectorApi` in `viable-public-api`, behind `POST /mcp`). Every
tool is written against it, so a tool cannot accidentally work in only one of the two. Which route
`openSession` calls fixes the mode: the delegated route carries the entitlement gate, so a caller
without the capability is refused at the boundary rather than by a check somewhere inside.

`ConnectorApi` has exactly one member per connector route plus the planning facade — the session
(`openSession`, `closeSession`, `pullOps`, `submitOp`), projects (with the agent controls
`project.stop(id, AgentStopArgs)` → `ConnectAgentLock`, `project.steer(id, { prompt })` → `AgentSteerResult`
and the story batch `project.batch.start(id, { stories? })` / `.get(id)` (`null` when none ran) /
`.cancel(id)` → `StoryBatchView` — only the fields named cross the wire), branding (`projectBranding(id, scope?)`,
`saveProjectBranding(id, patch, scope?)`, `setPlatformCredit(id, hidden, scope?)`,
`copyOrganizationBranding(id, scope?)` — a scope sent only when named), the configuration
(`config.get(id, scope?)`, `config.save(id, body, scope?)`, `config.recollect(id)`), the
organization's defaults (`account.branding.get()`, `.save(patch)`, `.backfill()`), the person's
inference preference (`account.llm.get()`, `.set(mode)`) and a project's override
(`project.llm(id)`, `project.setLlm(id, mode | null)` — `null` crosses as `null`), the person's
tokens (`account.tokens.list()`, `.revoke(id)` — never a create), consents
(`account.privacy.status()`, `.withdraw(keys)` — never a grant) and the intent pickup
(`account.intent.pickup(ref)`), story status, a new project's files (`materials.create(body)`,
`.upload(projectId, inputs, opts?)` — `@owlmeans/client-upload` over the tree, its `state` read for the
precheck —, `.remove(projectId, fileId)`, `.seal`, `.draft(projectId, force?)`, `.catalogue`, `.read(projectId,
path)`; the tree has no `open` and no `abort`), files
(`list`, `get(projectId, path)`, `save(projectId, path, content)`, `remove(projectId, path)`,
`meta(projectId, { kind, category? })` — the category sent only when named), the preview's
`sandbox` (`run`, `restart`, `stop`, `rebuild` → `ConnectSlotView`; `restartApp(projectId, app, { api?, web? })`
→ `ConnectAppsView`, only the sides named), a project's applications (`project.apps(projectId)` →
`ConnectAppsView`), the organization's `slot.list`,
`client()` (how the platform sees this connection, `ConnectClientView`; `null` when an older platform
answers the route 404 — any other failure throws), pipeline state, conversion (`create`, `check`, `start(projectId, body?)`, `proceed(projectId, body)`
— the bodies are the route's, `confirm` included —, `status`, `purge`) and inquiry answers. There is
no capability view, no session read or heartbeat, no conversion cancel, no token create and no
consent grant. A member is added together with the route in `connectProtocols` and its
`connectRef` entry — never one without the others. The one exception is `call.collect`: it belongs to
the context's transport (below), which collects a delegated write's outcome under whichever member
made it.

## A SESSION belongs to a host that stays; `toolHostHelper.sessionCapable` is what says so

A session is a connector ATTACHED — a process that drains the project's operations and holds a model
task until its answer comes back. The URL-configured host answers one request and forgets, so
opening one there would claim the project's single connector slot, **supersede the stdio connector
legitimately holding it**, and be abandoned before the first operation was delivered.

So `ensureSession` — what `confirm_project`, `reinitialize_project`, `develop_story`, `start_story_batch`,
`steer_agent`, `reset_story`,
`complete_story`,
`modify_project`, `rename_project` and `resume_pipeline` call before returning their job, every
story write, `update_project_settings`, `set_platform_credit`, `update_project_configuration`,
`recollect_configuration`, `apply_planning_kit`, `write_file` (its content check is a
model call the delegating session performs) and the conversion verbs before their
write, and `answer_question` in the delegated mode before an answer by id resumes a run — opens one
only on a `toolHostHelper.sessionCapable` host. `next_task`/`submit_task_result` are available on
`.performsModelTasks` (delegated **and** session-capable) and nowhere else: in the cloud mode the
platform performs every model call itself, a conversion's included, so there is never a task to
collect. `next_question`/`answer_question` stay on `.sessionCapable` — a person is asked whoever
performs the models. `serverInstructions` reads the same predicates: a parent told to call
`next_task` when the tool is not in its list is a parent that waits for a run nobody will advance.
A host that cannot serve the delegated mode says so in one sentence instead, naming the stdio
connector.

The in-process implementation refuses the four session verbs (`openSession`, `closeSession`,
`pullOps`, `submitOp`) with a message naming `@owlmeans/viable-mcp`, because "unsupported" alone
leaves the reader with nothing to do about it.

## A tool that cannot work in a mode is HIDDEN, not failing

`ToolDefinition.availability` and `catalogueHelper.visibleTools(host)` decide the catalogue a parent actually sees. A
tool a host cannot serve is a tool the parent tries once, is refused, and remembers as broken — so
the list it reads is exactly the set of things that work for it. Predicates (`toolHostHelper`): `anyHost`,
`localTarget`, `cloudTarget`, `withExecutor`, `delegatedLlm`, `sessionCapable`, `performsModelTasks`.

Every catalogue tool but `describe_platform` belongs to EXACTLY ONE `PLATFORM_CATALOGUE.capabilities`
group, and every group carries an `absent` sentence rendered where a host hides it. `serverInstructions`
(for a host without a profile `instructionsHelper.compose(host)`, `tools/instructions.ts`) is the
compact map a parent reads first: the workflow, ONE line naming each capability family by a few
of its tools ("everything the web application does except billing"), the cursor rule of the feeds, the
`confirm: true` set, the browser-only acts (payments and the plan, token creation, giving a marketing
consent or accepting terms, approving a connector, finishing a GitHub authorization) and the mode
rules — and it names NO tool the host hides: the files/preview, git/GitHub and production families and
`file_changes` appear only for a cloud target, the local block says those are the machine's.

## The delegated mode: every model call is the parent's, and a blocked tool hands its task over

`llm=local` is the ONE switch for who performs the platform's model calls. In the delegated mode
every one of them is this session's parent's — project drafting, every content check, story
formatting, every run's calls and a conversion's; in the cloud mode none is. The wording says it in
those terms everywhere it is said (`serverInstructions`, `describe_capabilities`, `describe_platform`,
the `model-tasks` group, `CONVERSION_COST`, `WORKING_RULE`): all or none, nothing in between.

A platform call can therefore stop mid-way for a model call the parent itself must perform — the
very parent blocked on that tool. `registerCatalogue` answers that with the HANDOVER
(`makeHandoverHelper(deps).run`) for every tool except the task/question loop and the tools that
never reach the platform (`HANDOVER_EXEMPT`):

- The call starts and races (i) finishing, (ii) a model task becoming available in the CURRENT
  session's queue (`taskAvailable`, looked for in 1 s slices because a delegated create opens its
  session from inside the call), (iii) `HANDOVER_WAIT_MS`. A finished call answers as it always did.
- A task first: it is taken (`nextTask(0)`; null means another caller was quicker and the race goes
  on) and the tool answers "`<tool>` is NOT finished — the platform is waiting on a model call you
  must perform. Do not call `<tool>` again. Run the task below in a clean subagent at LOW reasoning
  effort, then call submit_task_result {taskId, result}; its reply is `<tool>`'s result, or the next
  model call it waits on." followed by the task exactly as `next_task` renders it.
- Neither: "still running on the platform — call next_task (or read `<status tool>`)".
- The call is never abandoned. It lives in `ToolDeps.inflight` (`createInflightCalls()`, held beside
  the server — never on the session, which reopens whenever the connector moves), keyed by tool name
  + canonical JSON args, so an identical repeat JOINS it. A call some tool still waits on is that
  tool's to answer; once nobody waits it is detached, and `submit_task_result` and `next_task`,
  after their own work, race any detached call settling, the next task and the wait, then report
  every settled call (its text phrased exactly as the wrapper's catch phrases it; each in
  `structuredContent.settled[]`, a refusal marked `isError` there and never on the submit itself).
- The cloud mode and the URL host keep the plain deadline path, unchanged.

**A create names an UNATTACHED session.** In the delegated mode `create_project` and
`convert_project`'s create path first open a session with no project (`ToolDeps.detach?()` when one
is attached, then `deps.session()`), send its id as `sessionId` (`ConnectorApi.project.create(prompt,
target?, sessionId?)`, `ConnectConvertCreateBody.sessionId`) — the platform hands the checks it runs
before the card exists to that session's parent — and once the platform answers with project P,
`deps.attach(P); ensureSession(deps, P)`. A host without `detach` sends none while attached
elsewhere. The cloud mode sends none and opens nothing.

**Request now, collect later.** A delegated write may wait on a model call this very parent
performs — create, convert create, confirm, reinit, modify, rename, a settings save, a story create or
update (the platform formats the narrative in its planning `execute`) — for longer than an edge holds
a response open (~100 s). So `makeSdkContext({ llm: ConnectLlm.Local })` registers ONE transport
(`createCallCollectTransport`, under `transportAlias('http')`, which every client entrypoint asks for
before the API client) in front of the context's API client — the connector routes and the planning
client both go through it, with no per-method code:

- every NON-GET request carries `x-viable-call: <randomUUID()>` (`CONNECT_CALL_HEADER`); a request
  that already names one keeps it, so a retry of that request is the same call to the platform;
- an answer `{ pending: <that id> }` (202, after the platform's `CONNECT_CALL_ACCEPT_MS` hold) becomes
  `connect.call.collect` long polls (`wait` = `CONNECT_CALL_COLLECT_WAIT_SEC`, HTTP deadline wait +
  10 s), repeated while `pending` (an unheld one — under 1 s — rests 1 s first) until `settled`: its
  `value` and `outcome` resolve the original call exactly as a direct answer would have (the planning
  facade still builds its receipt), its `error` is `ResilientError.ensure`d back into its own class;
  `lost` throws `ConnectCallLost` (phrased in `REFUSALS`: the outcome was lost, read the matching
  status tool before repeating);
- a hop the LINE dropped (a transient transport error, axios's own timeout, an edge 502/503/504) is
  asked again, up to `COLLECT_DROPPED_HOPS` in a row; any other answer — a direct value, a `pending`
  of another id, a refusal, every GET, the cloud mode — passes through untouched.

`collect` is the transport's route, not a `ConnectorApi` member. Every request and collect hop stays
under `TOOL_DEADLINE_MS`; nothing caps the call as a whole but the platform's own model-task deadline,
and the handover is unchanged — its in-flight promise simply lasts as long as the collection.

## 45 seconds is the ceiling, so long operations return domain status

Every MCP host bounds a tool call and the strictest default in the field is sixty seconds (Codex).
`TOOL_DEADLINE_MS` leaves room for the round trip and keeps the connector inside every host's
ceiling without configuration. A tool that outlives its host's ceiling is reported to the user as a
**broken server**, and the true answer — the platform was slow — never reaches them.

Anything that takes minutes returns the owning domain's status and continues server-side.
`project_status`, `story_status`, `conversion_status` and `pipeline_status` compose the durable
records and run state a parent needs. `registerCatalogue` enforces the deadline per call (the
delegated mode's handover answers within `HANDOVER_WAIT_MS` instead) and
converts a throw into an `isError` result the model can read and act on, because an exception
crossing the transport tells it only that something went wrong somewhere. Each status renderer
ends with a single `next:` line so the parent follows the domain workflow and does not invent a
polling strategy or treat a parked run as failed. What HAPPENED along the way is read from the cursor feeds
(`project_activity`, below) — a feed is never the answer to where a run stands.

## The story tools speak planning

A user story is a planning CARD of `VIABLE_STORY_TYPE` under its project card, and every change to one
is a transition executed through `ConnectorApi.planning` — a `PlanningFacade`: the client facade
`appendPlanningClient` registers over HTTP, and `ensurePlanningService(ctx).for(scope)` in the
platform's in-process host. The scope a call answers for is the CREDENTIAL's; a tool sends none.

| Tool | Facade call |
|---|---|
| `list_stories` | `cards.list({ ...storyHelper.storyQuery(project, { status, area }), page, size, sort: STORY_ORDER })` → `storyHelper.renderStories` |
| `search_stories` | the same with `{ q }` |
| `create_story` | `execute({ action: create, card: { kind: card, type: VIABLE_STORY_TYPE, parent, title, fields: { primary: false, area? } } }, { wait: true, timeout: COMMIT_WAIT_MS })` — `area` only when the person named one, by KEY (`AREA_KEY_PATTERN`, ≤ `AREA_KEY_MAX`; a custom area's slug from `project_apps` included); the platform checks it against the project's map and keeps it over the formatted area |
| `update_story` | `storyHelper.resolveStory` → `execute({ card, action: update, changes: { title }, expectSeq: head ?? seq }, { wait: true, … })` |
| `delete_story` | `storyHelper.resolveStory` → `execute({ card, action: delete }, { wait: true, … })` → the project-lock poll |
| `develop_story` | `storyHelper.transit(deps, project, storyId, start, 'connector:develop-story')` |
| `reset_story` | `storyHelper.transit(…, reset, 'connector:reset-story')` — any status back to planned |
| `complete_story` | `storyHelper.transit(…, complete, 'connector:complete-story')` — in progress only |
| `story_status` | `storyHelper.resolveStory` → the card, its development run, pending inquiry, warning and landing mark |
| `start_story_batch` | `ensureSession` → each `storyIds` ref `storyHelper.resolveStory`d to its card id (deduplicated; none = every planned story, `{}`) → `api.project.batch.start` → `statusTextHelper.renderBatchStatus` |
| `story_batch_status` | `api.project.batch.get` → the batch in implementation order (code, state, ordering reason), progress, halt reason phrased, `next:`; `null` → "No story batch has run" |
| `cancel_story_batch` | `confirm: true` → `api.project.batch.cancel` FIRST, then — when `current` has no outcome — `api.project.stop({ scope: story, storyId: current, confirm: true })`; `AgentNotRunning` there means the batch was between stories |

Rules the table rests on:

- **A tool NAME is a parent agent's vocabulary and is never renamed**, and neither is an argument:
  `storyId` stays `storyId` although the platform keys on card ids. New facts are added (`designSystem`
  on `confirm_project`, the project status line and the design-system section of `project_status`),
  never substituted.
- **`storyId` accepts a code or an id**, because `list_stories` prints the CODE — the handle every
  generated file names a story by. `storyHelper.resolveStory` asks for both at once, the id wins, a code is also
  tried uppercased, and neither answers for a story of another project (`ProjectStoryNotFound`).
- **A story moves through its flow by ONE helper.** `storyHelper.transit(deps, projectId, ref,
  transition, cause)` resolves the story, executes the transition awaited to its commit and answers
  `{ card, status }` from `story.status`. Development is the story's `start`, not a call of its own:
  the platform begins the run once that move COMMITS, and refuses it there too (the flow, one story
  in progress, the balance). `reset_story` (`* → planned`, the manual recovery — the code generated
  for it stays) and `complete_story` (`in-progress → completed`, nothing generated or stopped) are
  the browser's two manual moves. The wait is `COMMIT_WAIT_MS`, well inside the tool deadline; a late
  commit is not a failure — the transition is durable — so the tool answers from `story_status`
  rather than outliving the host's ceiling. A refusal is thrown, and no status is read to hide it.
- **A story a person writes goes as written, with no area.** Re-formatting the narrative and deciding
  the area are the platform's, done in its planning middleware for the `connect` channel; a connector
  that guessed an area would be a second answer. `update_story` carries only `title` and the head it
  read, so a change made in between is refused (`WorkcardConflict`) rather than overwritten.
- **The delete commit is no proof the slot is done.** It says the card is gone and nothing about the
  placeholder screens still being retired under the project lock, so `delete_story` keeps its two
  unlocked observations.
- **Stories are read in `order`, then `createdAt`**: `order` is the analysis's flow ordinal (a
  connective story sits at a fraction between two steps). `storyHelper.renderStories` keeps the line shape a parent
  already reads — `code · status[ · primary][ · landing gate][ · area]` over the narrative — under a
  header counting the page by intrinsic state. A new fact is a new FLAG beside `primary`; the area
  stays last.
- **The landing gate story is read off the card the tool already holds** (`fields.landing`, at most
  one per project, decided by the platform at initialization — a connector never sets it). The list
  flags it; `story_status` and `develop_story` pass the resolved card to `statusTextHelper.renderStoryStatus`, which
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

- **Run all, Stop and Steer are the browser's own controls.** A batch is the PROJECT's (no story
  route), started over planned stories only, ordered by the platform before its first story, and
  each of its stories runs exactly as `develop_story`'s would; `start_story_batch` is never a near-twin
  of `develop_story` in its description. `stop_agent { scope?: run | story | batch, storyId?, confirm? }`
  sends only what it was given (a `storyId` resolved to its card): a story stop rolls the story back to
  where that run started and returns it to planned, `batch` also cancels the batch, `run` (an open-ended
  change) stops once the model's current answer arrives and keeps its edits — so every scope but `run`
  (an omitted scope included) needs `confirm: true`. A stop opens no session; `steer_agent { prompt }`
  does (`ensureSession`: its content check is a model call) and answers the queued message id.
  `AgentNotRunning`, `StoryBatchActive` and `StoryBatchEmpty` are phrased in `REFUSALS` by their
  `viable-common` markers ("Nothing is running on this project right now …"). `project_status` says
  `agent: stopping (…)` while `agent.stopping`, and names `steer_agent` / `stop_agent` while
  `agent.steerable`.

## An irreversible tool asks for `confirm: true`, and every tool declares its annotations

`delete_project`, `delete_file`, `purge_origin`, `git_discard`, `git_revert`,
`disconnect_github`, `revoke_access_token`, `publish_production` and `cancel_story_batch` take `confirm` (`z.boolean()`,
described, NO default), and `manage_app_user`'s `remove`, `manage_app_group`'s `delete` and every
`stop_agent` scope but `run` take it as an optional field the action requires; each answers "Not done … ask the user" without a single platform
call unless it is `true` — the confirmation is the TOOL's, a person agreed before the route is reached.
`serverInstructions` names the same set in one sentence. `delete_project` also
REQUIRES `projectId` (`z.string().min(1)`, never the attached project by default) and, on a
session-capable host attached to that project, closes the session first (`deps.release`, else
`currentSession()?.close()`) and `deps.detach()`es, then `api.project.destroy` → `{ id, name, alias }`;
on a local target it says the files and `.viable/` stay. There is no tool and no `api.project` member
that force-releases a project's lock: the connector never had a safe use for it (a run still working
is not stopped), and a platform keeps the old route only to answer that it is no longer supported.

`ToolDefinition.annotations` is REQUIRED — the MCP tool annotations a host shows the person approving
a call — and `registerCatalogue` passes it through beside the title, description and input schema.
The shapes are public presets (`tools/consts.ts`, exported from the root and `./tools`, so a profile
or a host builds on the same four): `READ_ONLY` (reads, statuses, descriptions), `WRITE`
(additive changes, the task and question loop), `IDEMPOTENT_WRITE` (setting a value: settings,
`update_story`, `reset_story`, `attach_project`, `stop_local`, `set_local_service`) and
`DESTRUCTIVE` (`delete_project`, `delete_story`, `purge_origin`, `reinitialize_project`, `git_revert`,
`cancel_story_batch` and `stop_agent` (both idempotent — a story stop rolls code back),
`publish_production` (it replaces the live site), and — also idempotent —
`write_file` (it replaces a file whole), `delete_file`, `git_discard`, `disconnect_github`,
`revoke_access_token` and `production_control` (it takes the live site down or restarts it); `preview_control` and
`link_github_origin` are `IDEMPOTENT_WRITE`); `openWorldHint` is `false` everywhere except
`convert_project`, which may clone a repository from the internet. A new tool picks one; a read is
never destructive (`catalogue.spec.ts` pins the destructive set).

## A new project's files: sent from this machine, read on every host

`create_project_with_files` (only where `toolHostHelper.uploadsMaterials`: a stdio host, never target
`local` AND llm `local`), `list_materials` and `read_material` (every host) — the precheck, the send and
seal, the 45-second answer and the words: part [materials](parts/materials.md).

## A cloud target's files and preview are the web editor's and sandbox card's own calls

All cloud-target only (`toolHostHelper.cloudTarget`), on both hosts; a local project's tree and
process are on the user's machine, read and run directly.

- **`list_files { kind?, category? }`** — no kind (or `sources`): `files.list`, the generated
  sources; `stories` / `meta` / `all`: `files.meta` (the story documents, the specifications beside
  the sources narrowed by `category` — sent with `meta` only — or every metadata document).
- **`read_file { path }`** answers the content as the text, cut at `FILE_READ_CAP` (100 000
  characters) with a note naming the full length; `structured` carries `path`, `length`, never the
  content twice.
- **`write_file { path, content }`** replaces the whole file; **`delete_file { path, confirm }`**
  refuses without `confirm: true` and makes no call. Both answer "the preview was rebuilt" or,
  when `buildWarning` came back, that the rebuild FAILED and the last good build still serves — the
  change stands either way. A protected file (manifests, build configuration) is refused by the
  platform as `target-integrity:<path> … cannot be edited`, phrased as that one file
  (`PROTECTED_FILE_DETAIL`), never as the tree failing its shape check.
- **`preview_control { action: start | restart | stop | rebuild }`** → `sandbox.run` / `restart` /
  `stop` / `rebuild`, answered with the workload line (`statusTextHelper.renderSlot`); a rebuild
  goes on after the answer under the project lock. Never the production site.
- **`list_slots`** (any host, any target) — every workload of the organization, one line each plus
  its warnings. `viable-slot:not-found:` is phrased as a project with no workload yet.

## A project's applications: `project_apps` and `restart_project_app`, on every host and target

A project is `main` at its address's root plus, when split, one app per group of areas under its own
mount (`/admin`, `/backoffice`, …) — each with its interface and server. Both tools are in the
`apps` capability group, `anyHost`, under every profile (listing annotations: `project_apps` READ,
`restart_project_app` ADDS — it repeats; output `APPS_OUTPUT`, presenter `presentation/platform/apps.ts`).

- **`project_apps { projectId? }`** → `api.project.apps` → `appsToolHelper.renderApps` (`tools/apps.ts`):
  one line per app (`name · /mount · areas … · interface … · server …`, the capped cause beneath),
  then `Areas — a story's area is one of these keys:` and one line per area (`<key> (<kind>) · <app> ·
  <path> · segment … · <label> · only people granted <marker>`; the view's `areas`, the legacy view's
  four standard ones), the worker, and `next:` naming the failing app's restart. Its structured output
  (`APPS_OUTPUT`) carries `areas` too. A local project: the platform's map, and
  where each app answers in the local run (`localStatus().apps`).
- **`restart_project_app { projectId?, app, web? }`** — cloud: `api.sandbox.restartApp` (`web: true` →
  `{ api: true, web: true }`, else `{}`); local: the run record must hold the app, then
  `makeRunStateHelper(dir).restartApi(app)` — the platform is never asked.
- **Refusals** (`REFUSALS`): `slot-app:unknown:` ("serves no application … project_apps lists"),
  `slot-app:restart-unsupported` / `slot-app:apps-unsupported` ("restart the whole preview with
  preview_control { action: restart }" — `restart_preview` under a listing). A bare 404 is told apart
  by `appsToolHelper.routeMissing`: no app marker AND `project.status` still answers ⇒ an older
  platform — "This platform reports one application (main)"; a restart then also reads
  `project.apps` (404 again ⇒ restart the whole preview; else "serves no application" + the list).
- **Stories**: `renderStories(items, page, total, apps?)` adds ` · app: <name>` (` · apps: a, b`)
  after the landing flag, the area still last, and `renderStoryStatus` an `app:` line — only for a
  card whose `fields.area` is a custom key or that names `fields.areas` (`appsToolHelper.storyApps`
  reads the project card once, only then). Every other line, and `project_status` / `session_status`, stays byte-identical
  (`apps-tools.spec.ts`).

## A cloud target's git and its GitHub connection are the web Git dialog's own calls

All cloud-target only (`toolHostHelper.cloudTarget`), on both hosts — a local project's repository is
on the user's machine; group `git` in `PLATFORM_CATALOGUE.capabilities`; rendered by `gitToolHelper`
(`tools/git.ts`, words in `consts.local.ts`: `GITHUB_STATUS_WORDS`, `GIT_SYNC_WORDS`). Members
`ConnectorApi.git.{status,log,commit,discard,revert}` and `ConnectorApi.github.{authorize,publish,push,
pull,disconnect,repos,branches,link}` (`connect.git.*` / `connect.github.*`, the library's mirror types
`ConnectGit*` / `ConnectGithub*` — no `@owlmeans/git` dependency, statuses are strings).

- **`git_status`** (read-only): the connection line (login → repository · status words) and the
  tree — branch, head, ahead/behind, the first `GIT_FILES_SHOWN` changed paths. `git: null` reads as
  "the preview is not ready" with `preview_control { action: start }` as the cure — never as an error.
- **`git_history`** (read-only), **`git_commit { message }`** (`WRITE`, trimmed, ≤ 200),
  **`git_discard { confirm }`** and **`git_revert { hash, confirm }`** (`DESTRUCTIVE`; refused without
  `confirm: true` before any call; the hash is lower-cased and must match `^[0-9a-f]{7,40}$`; a revert
  is a NEW commit and its `dbWarning` is printed).
- **`connect_github`** answers the `authorizeUrl` the USER opens in the browser where they are signed
  in; GitHub returns to the OwlMeans web application, which completes it. No tool, route or member
  completes an authorization (`git-tools.spec.ts` pins it), and nothing ever carries the token.
- **`publish_to_github { repoName?, private? } | { owner, repo }`** (`WRITE`, in `answering`: the
  `conversion:publish-origin` refusal is the tool's own sentence); half an existing repository is
  refused locally. **`github_sync { direction: push | pull }`** answers a refused outcome
  (`conflict`, `rejected`, `no-remote`, `auth-failed`) as `isError` with the cure; a pull rebuilds.
- **`github_repositories { owner?, repo?, page?, search? }`** (read-only): repositories, or — with
  both `owner` and `repo` — that repository's branches; one of the two alone is refused locally.
  **`link_github_origin { owner, repo, branch? }`** (`IDEMPOTENT_WRITE`) records where an import comes
  FROM. **`disconnect_github { confirm }`** (`DESTRUCTIVE`, idempotent).
- The writes map to `git_status` for the handover's domain status (`STATUS_TOOL_OF`). The refusals
  `github:not-connected`, `github:not-published` and `oauth:invalid-or-expired-state` name
  `connect_github` / `publish_to_github`; `git-busy:` is the agent holding the project.
- Specs: `tests/git-tools.spec.ts`, `remote.spec.ts` (the thirteen routes and their closed bodies).

## A cloud target's production site is the web Publish dialog's own calls

All cloud-target only (`toolHostHelper.cloudTarget`), on both hosts — a local project is deployed from
its own machine; group `production` in `PLATFORM_CATALOGUE.capabilities`; rendered by
`productionToolHelper` (`tools/production.ts`, words in `consts.local.ts`: `PRODUCTION_STATUS_WORDS`,
`DOMAIN_STATUS_WORDS`, the actions `PRODUCTION_ACTIONS`, `DOMAIN_ACTIONS`). Members
`ConnectorApi.production.{status,publish,restart,stop,domain.{attach,verify,detach},auth,setRedirects}`
(`connect.production.*`). Never the preview — that is `preview_control`.

- **`production_status`** (read-only): never published, or the status words and — when live — the
  address (the custom domain once `linked`, else the generated host), the warnings, the domain line,
  and the next step.
- **`publish_production { confirm }`** (`DESTRUCTIVE`; refused without `confirm: true` before any
  call) — the publish starts and goes on after the answer; **`production_control { action: restart |
  stop }`** (`DESTRUCTIVE`, idempotent). Both in `answering`: the published-sites `limit-exhausted:`
  refusal (a stopped site's restart takes a unit too) is the tool's own sentence.
- **`custom_domain { action: attach | verify | detach, domain? }`** (`WRITE`, in `answering`): an attach
  needs `domain` (trimmed, lower-cased) and answers the two DNS records the USER creates
  (`CNAME <domain> → <cnameTarget>`, `CNAME <dcvName> → <dcvValue>`) with the provider's state of each,
  until the domain is `linked`; `null` from an attach is "publish first". `viable-domain:taken:` and
  `capability-required:feature:domain--custom` are phrased.
- **`production_auth`** (read-only) prints the issuer, the client id and the redirect addresses — the
  client secret only as set or not (`secretSet`; the user reads it in the web application).
  **`set_production_redirects { redirects }`** (`IDEMPOTENT_WRITE`) replaces the whole list, applied on
  the next publish.
- The writes map to `production_status` for the handover (`STATUS_TOOL_OF`).
- Specs: `tests/production-tools.spec.ts`, `remote.spec.ts` (the nine routes and their closed bodies).

## The generated app's sign-in is the owner console's own calls

Any host and any target (`toolHostHelper.anyHost`) — the IAM is the PLATFORM's, a local project's app
included; group `app-sign-in` in `PLATFORM_CATALOGUE.capabilities`; checked and rendered by
`iamToolHelper` (`tools/iam.ts`: `missing`, `grantBody`, `render*`; actions `APP_USER_ACTIONS`,
`APP_GRANT_ACTIONS`, `APP_ORGANIZATION_ACTIONS`, `APP_GROUP_ACTIONS`, `IAM_ROWS_SHOWN`, `IAM_EXTERNAL`
in `consts.local.ts`). Members `ConnectorApi.iam.{organizationUsers, permissions, setDefault,
grants.*, users.*, organizations.*, groups.*}` over `connect.iam.*` and `connect.account.iam.users`;
the bodies and answers are the library's owner-console types (`Iam*`, `@owlmeans/viable-common`). Every
tool takes `scope` (`ephemeral` | `production`, absent = the preview's client): a read sends it in the
query, a write — a removal included — in its body.

- Reads (`READ_ONLY`): **`app_users { projectId?, scope?, all? }`** (`all: true` = every end user of
  every app of the organization, read-only), **`app_permissions`** (definitions + tenancy flags),
  **`app_grants { profileId? | group? + entitySlug }`**, **`app_organizations { entitySlug? }`** (members
  of one when a slug is named), **`app_groups { entitySlug, group? }`** (members of one when a key is named).
- Writes: **`set_app_permission_default { permission, defaultClass?, entityScoped? }`**
  (`IDEMPOTENT_WRITE`); `DESTRUCTIVE`: **`manage_app_user { action: invite | update | remove }`**,
  **`manage_app_grant { action: assign | revoke, permission, profileId | group + entitySlug,
  resources?, mode? }`**, **`manage_app_organization { action: rename | add-member | update-member |
  remove-member, entitySlug }`**, **`manage_app_group { action: create | update | delete | add-members |
  remove-members, entitySlug, group }`**.
- **Grants restrict as well as grant.** Every subject (person or group) has its OWN blanket value per
  binding: granted, restricted, or absent (inherits). A whole-permission revoke (`blanket`/`all`, or no
  mode without `resources`) RESTRICTS a declared permission — the subject also loses what it inherits
  from a default class, a group or a bundle; `mode: inherit` (revoke-only) takes back only the
  subject's own value, so it holds what it inherits again; a `resources` revoke removes those ids only.
  `iamToolHelper.renderRevoke` words the result by that mode. The tool descriptions and the `mode`
  enum text say the same, and nothing here re-implements the IAM's evaluation.
- `app_grants` prints what is HELD and what a subject's own restriction withholds (`restricted: true`
  — listed, never held): the head counts them apart (`Grants (N held, M restricted)`), a restricted row
  ends `· restricted`, and `IAM_RESTRICTED_NOTE` closes a listing that has any. Origins print as
  given: `direct`, `default`, `group` (with `through`), `bundle` (a group's own listing: the names its
  bundles select).
- The platform's staff group (`IAM_MEMBERS_GROUP`, `managed: true`) keeps its members, bundles and
  existence: `manage_app_group` writes to them are refused by the IAM; its PERMISSIONS are the owner's,
  granted and restricted with `manage_app_grant { group }`. `renderGroup` and the `manage_app_group`
  description say exactly that — never "read-only".
- **Action-specific fields are checked BEFORE any call** (`iamToolHelper.missing`): an invite needs
  `email`, an update something to change, a grant exactly ONE subject (a person, or a group with its
  organization's `entitySlug` — never both), an `assign` no revoke-only mode (`REVOKE_ONLY_GRANT_MODES`:
  `all`, `inherit`), a group's update `title` or the WHOLE `bundles` list, the members' moves
  `profileIds`; **`remove` and `delete` need `confirm: true`**. A refusal is `isError` with nothing
  called. The contract's schema admits every mode on both bodies; the IAM refuses the revoke-only
  ones on a grant.
- A listing answered `external: true` prints `IAM_EXTERNAL` (the app's sign-in is managed in a console
  of its own), never "nobody". `refusalHelper` phrases `iam:group:managed:` (the staff group: members,
  bundles and existence the platform's, its permissions editable — placed ABOVE `iam-refused:`) and
  `iam-refused:` (a managed definition or member, the last owner, an empty organization); every tool
  runs in `answering`. The writes map to their read for the handover (`STATUS_TOOL_OF`). No
  staff-synchronization tool.
- Specs: `tests/iam-tools.spec.ts` (hosts, annotations, every refused shape with no call — revoke-only
  modes on assign included —, the calls made, `inherit` and records revokes, held/restricted counts and
  the `bundle` origin, the staff group's line, the staff-group and generic refusals), `remote.spec.ts`
  (scope placement, the account-base listing).

## What the browser streams is read by cursor

The browser's sockets have no connector twin; their content does, as three read-only cursor feeds
(group `feeds` in `PLATFORM_CATALOGUE.capabilities`, rendered by `feedToolHelper` in `tools/feed.ts`):
**`project_activity { projectId?, after?, limit?, wait?, detail? }`** and **`notifications { after?,
wait? }`** on any host, **`file_changes { projectId?, after?, wait? }`** on a cloud target. Members
`ConnectorApi.project.activity`, `account.notifications`, `files.changes` over `connect.project.activity`,
`connect.account.notifications`, `connect.files.changes`; answers `ConnectFeedPage { cursor, entries,
gap }` (`ConnectFileChanges` adds `watching`).

- **The cursor is ECHOED** in every answer's structured content (`cursor`, `gap`, `entries`), and the
  text ends with the exact call that reads on (`feedToolHelper.nextCall`: the same arguments, `after:
  <cursor>`, `wait: 20`). Without `after` a read answers the latest entries; an empty feed answers
  `CONNECT_FEED_START`. A `gap` line sends the parent to the domain status, never to a replay.
- `wait` is at most `CONNECT_FEED_WAIT_MAX_SEC` (20 s) — inside the 45 s deadline; the remote API gives
  a held read ten seconds beyond its wait (`feedTimeout`) and sends only the query fields named.
- `detail: thinking` adds the model's own words (coalesced excerpts); the default `progress` leaves
  them out. One line per entry, folded and cut at `FEED_LINE_MAX`; a toast is phrased from
  `FEED_TOAST_WORDS`, never shown as its marker. `file_changes` says when nothing watches the tree
  (`watching: false` — `preview_control { action: start }`).
- Every feed tool runs in `answering`. Specs: `tests/feed-tools.spec.ts` (hosts, annotations, the
  echoed cursor and the read-on call, the gap and empty answers, the toast phrasing, `watching`, a
  refusal answered, every kind one bounded line), `remote.spec.ts` (paths, queries, deadlines).

## The project settings are ONE record, and the platform is the only validator

`project_settings` and `update_project_settings` read and change what a person edits on the project's
control panel — the copyright line, the organization name, the Terms and Privacy links and the Google
tag — through `ConnectorApi.projectBranding(projectId, scope?)` and
`saveProjectBranding(projectId, patch, scope?)` (`connect.project.branding.get` / `.save`,
`ConnectProjectBranding` / `ConnectProjectBrandingSave` from `@owlmeans/viable-common`). Every
settings and configuration tool takes `scope` (`CONFIG_SCOPES`: `ephemeral` or `production`) —
production's own set, taken at its next Publish (`settingsHelper.settingsReach(target, scope)` says so).

- **A save is a PATCH.** `settingsHelper.settingsPatch` keeps exactly the settings the call named, trimmed; an
  omitted one keeps its stored value, and an EMPTY string is sent as given — for the Google tag that
  is the removal, for the others a value the platform refuses. A call naming none is refused locally
  and saves nothing. The answer is the merged record the platform stored, led by where the change
  shows (`settingsHelper.settingsReach`): a cloud preview is rebuilt, production takes it at the next Publish; a
  local project gets it in its `.env` and `run_local` builds with it.
- **`useOrganizationDefaults: true`** calls `copyOrganizationBranding` instead — ALONE: with any
  other setting the tool refuses before calling anything, so one call never asks for two pushes.
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
- **The credit is read here and switched elsewhere.** `ConnectProjectBranding.credit` renders as one
  line (`settingsHelper.creditLine`: hidden; shown with the request kept until the plan includes
  white label; shown and hideable; shown and not on the plan). `set_platform_credit { hidden }` →
  `setPlatformCredit` is its own gated route: a plan without white label is a `capability-required:`
  person refusal, phrased and notified inside the tool (`answering`). The patch never carries it.

## Configuration variables: a backend value is never shown

`project_configuration`, `update_project_configuration { backend?, frontend? }` (maps of
NAME → value; `configHelper.configBody` turns them into the wire's `ConnectConfigValue` lists, a side
the call did not name left out) and `recollect_configuration` (the platform's own model run) call
`ConnectorApi.config.*`; `configHelper.renderConfiguration` prints a backend variable as `set` /
`NOT SET` — never a value, even one an older platform sent — and a frontend variable with its public
value, then what still needs one. A save's answer names the variables set and never echoes a value.
Writes call `ensureSession` first. A refused name (`authen:payload:<NAME>` — malformed, named twice,
or already declared on the other side) reads as a sentence naming it.

## The organization's defaults

`organization_branding`, `update_organization_branding { organizationName?, copyright? }` (a PATCH,
trimmed; a call naming neither is refused locally) and `backfill_project_branding` call
`ConnectorApi.account.branding.*` (`settingsHelper.renderOrganizationBranding`). A project keeps its
own copy after creation: `update_project_settings { useOrganizationDefaults: true }` copies them in.

## The person's own records: inference, tokens, consents, the intent pickup

All `toolHostHelper.anyHost`, rendered by `accountHelper` (`tools/account.ts`); groups `inference`,
`access-tokens`, `privacy`, `intent` in `PLATFORM_CATALOGUE.capabilities`.

- `inference_settings { projectId? }` (read-only: the default, the attached or named project's
  override and its effective mode, whether the plan allows `local`) and `set_inference_mode { level:
  account | project, mode: cloud | local | inherit, projectId? }` (`inherit` = `null`, a project
  only; an account `inherit` is refused locally). Both end with `INFERENCE_REACH`: the setting is the
  default of the web application and connector hosts. A running stdio connector keeps its resolved
  mode until restarted; explicit `--llm` or `VIABLE_LLM` overrides outrank the account preference.
  A plan without the local mode is the
  `capability-required:` person refusal, notified.
- `list_access_tokens` (read-only, never a secret) and `revoke_access_token { tokenId, confirm }`
  (destructive, idempotent; revoking this connector's own token signs it out). No tool creates a
  token. A foreign id is phrased (`authorization:forbidden:token`).
- `privacy_choices` (read-only, the SAVED answers: given / not given / never answered / wording
  revised) and `withdraw_marketing_consent { keys | all }` (`all` reads the status and withdraws the
  given ones; both together refused). No tool gives a consent. An unknown key is phrased
  (`marketing-consent:unknown:`).
- `pickup_intent { code }` — the ref, or the whole `/start?ref=…` address (`accountHelper.intentRefOf`);
  answers the prompt and points at `create_project` once the user confirms. `viable-intent:expired:`
  and `viable-intent:throttled:` are phrased.
- Spec: `tests/account-tools.spec.ts`.

## Planning kits are described, then applied; the platform writes and rebuilds

A planning kit is a ready set of card types and status flows for one kind of work-management
product, which the platform writes into the target's common package (`PLANNING`).
`describe_planning_kits` (`ConnectorApi.project.kitDescribe(projectId)`, GET
`connect.project.kit.describe` → `{ kits: PlanningKitView[] }`) lists each kit's purpose, container,
types with their main flow and each flow's statuses; it opens no session. `apply_planning_kit`
(`project.kitApply(projectId, { kit, types? })`, POST `connect.project.kit.apply` →
`{ applied, skipped, warnings }`) refuses a call without `kit` locally, attaches the connector first
(`ensureSession`: the write is a file operation a local project's connector answers), runs in
`answering`, and answers what was written, left out and warned. `types` keeps those kit type keys;
omitted keeps all. Both are offered on every host, in the `planning-kits` capability group. The SDK
never renders the literals or rebuilds — the platform does, inside the 45-second ceiling.

## `describe_platform` also says what a generated application CARRIES

`PLATFORM_CATALOGUE.features` holds facts about the product the runs produce — the landing gate, the
generated Terms and Privacy pages, the consent-gated Google tag, the look, production builds without
preview scaffolding — rendered whole on every host under "WHAT A GENERATED APPLICATION CARRIES", with
only their `tools` narrowed to what the host offers. A parent that is not told the platform generates
the legal pages writes its own beside them. `describe_capabilities` ends with `GENERATED_SUMMARY`, the
same facts in one sentence, because it is read at the same moment by a parent that may never call
`describe_platform`; the two sit side by side in `platform.ts`. The pipelines' `stages` name the steps
a run can stop at (`landing` and `legal` in init, `landing` in story development).

## A balance, consent, confirmation or plan refusal is phrased for a person, and pushed through `notify`

`refusalHelper.personRefusalPhrase(e, retry?)` (`tools/refusal.ts`) phrases the refusals only a PERSON can
resolve — the three of `@owlmeans/viable-common` `connect/errors.ts` by `instanceof`, and the plan's
two by MARKER, because `CapabilityRequired` / `LimitExhausted` are declared in `@owlmeans/payment`,
which this package does not depend on — and answers `null` for anything else:
`capability-required:<param|param>` → `capabilityRequiredPhrase` (the feature named from
`CAPABILITY_LABELS`, the plan changed in Billing, nothing the parent does unlocks it) and
`limit-exhausted:<key>:<used>/<limit>[:<ISO>]` → `limitExhaustedPhrase` (the limit, how full, the
renewal day). Both also stand in `REFUSALS` for the stored-text path. Both `registerCatalogue`'s catch and the conversion tools' `answering` use it, so a
conversion's balance refusal reads exactly like any other tool's:

- `ConnectOutOfCredits` — rather than the raw `viable-connect:out-of-credits:...` marker, the tool
  result reads as a sentence: what it needed, what the account has, and a link to top up.
- `ConnectConsentRequired` — the EU spend consent: "Nothing was started", why (credits bought less
  than 14 days ago may only be used once a person expressly asks, the purchase still withdrawable up
  to the last day), the `consentUrl` to open and confirm in the browser, and that the call must NOT
  be retried automatically — only after the user says they confirmed (`refusalHelper.consentRequiredPhrase(url,
  deadline)`, shared with the stored-text entry below).
- `ConnectConfirmationRequired` — a conversion step that would use the plan's conversion or spend
  credits (`refusalHelper.confirmationRequiredPhrase(fields, retry?)`): "Nothing was started"; for a start, what the
  plan's conversion covers (free up to `cap` credits, the conversion limit; beyond it credit limits
  first, then topped-up credits; every stage quoted and asked first); for a stage, its estimate
  split ("580,000 from the conversion limit, 150,000 from the organization's credit limits, $2.40
  of topped-up credits" — credit limits as credits, topped-up credits as money) and what the limit
  has used and left. Then: tell the user exactly this, and only after they agree make the call it
  prints — never `confirm: true` on the model's own. Every variant names the conversion limit (a
  conversion with no plan unit "has no conversion limit").

Their fields travel packed into the message (only `type` and `message` survive the platform's
internal HTTP hop) and are read back with `finalizeUnmarshal()`. All three are also handed to the
optional `ToolDeps.notify?('warning', text)`, which a host wires to its own out-of-band channel —
the stdio `viable-mcp` host sends an MCP `notifications/message`; the platform's stateless `/mcp`
host has no channel and omits it, so `notify` is always best-effort and optional. Every other
error returns through `refusalHelper.refusalPhrase` and never calls `notify`.

**A conversion's confirmation is answered inside its tool, with the exact call to repeat**
(`confirming` in `catalogue.ts`): `convert_project` / `proceed_conversion` print
`<tool> {"projectId":…[,"decision":…,"note":…],"confirm":true}` — the project NAMED, because the
URL-configured host keeps no attachment between calls and a bare repeat of `convert_project` there
would file a second conversion (the start is what a confirmation stops; the create before it is
never repeated). Both take `confirm` (`z.boolean().default(false)`, described), sent only when the
parent passed `true`, and their descriptions explain the conversion limit (1,000,000 credits today),
the spend order and that a delegated conversion is never asked — so a parent can say it before it is
refused. A production body carries only the status: a bare `api:client:status:428` to a call sent
WITHOUT `confirm` is answered with `refusalHelper.unconfirmedConversionPhrase(retry)` (the confirmation, and the
consent as what a second refusal of the confirmed call would mean); to a confirmed call it can only
be the consent and falls to `REFUSALS`. `serverInstructions` says the same in one sentence of the
workflow paragraph.

`proceed_conversion` also takes the person's edits flat — `name`, `description`, `specification`,
`vision`, `designSystem` — and sends the ones given nested as `update` (`PROCEED_UPDATE_FIELDS`);
the platform accepts them only with the decision that starts the extraction, and the printed repeat
call carries them too.

The integrations' refusals each have a sentence in `REFUSALS` as well: `github:not-connected`,
`github:not-published`, `oauth:invalid-or-expired-state` (the GitHub authorization),
`viable-domain:taken:` (a custom domain held by another project), `iam:group:managed:` (the staff
group's members, bundles or existence) and `iam-refused:` (the app's own sign-in refusing a console
change on its terms).

The same refusals also arrive where no class survives, and `REFUSALS` phrases them by marker:
`viable-connect:consent-required:` (a stored run error; the URL and deadline parsed from the
detail), `viable-connect:confirmation-required:` (`ConnectConfirmationRequired.decode` of the
detail, the generic "same arguments and confirm: true" repeat), `performance-consent-required` (the web refusal inside a planning `commit-failed:` or a
stored error — no URL, so "Billing in the OwlMeans web application") — both ABOVE the planning
markers, because the consent is what the person acts on — and, for a production body that carries
only an incident id (`@owlmeans/api` `ApiStatusError`), `api:client:status:428` (the consent
sentence) and `api:client:status:402` (the balance sentence).

## The session loop: a pull loop that never stops, a serial worker, and free to redeliver

`openSession` runs two loops. The PULL loop files model tasks and questions for the parent and hands
every local operation (`SlotCommand`, `Configure`) to the WORKER, which answers them **one at a time**.
Serial because the thing on the other end of a local operation is a filesystem the platform believes
it is the only writer of — two concurrent template writes into one tree is not a throughput problem,
it is a corrupted tree. Separate because a local command can take minutes (`bun install`), and a
model task the platform is blocked on must still be delivered meanwhile. An operation queued or
running on the worker is not queued again when it is redelivered. A pull that came back empty in
under `FAST_PULL_MS` (1 s) is followed by `EMPTY_PULL_PAUSE_MS` (1.5 s) of rest.

The task queue hands out the task with the earliest `expiresAt` first (a synchronous check expires
in seconds, a run's call in minutes). `take(waitMs, signal?)` is cancellable and REMOVES an aborted
waiter — a leftover one swallows the next item, held as outstanding and shown to nobody — and
`available(waitMs, signal?)` waits for a queued item without consuming it.

Results are remembered by operation id. A connector that reconnects is handed everything still
outstanding, **including whatever it had already answered when the connection dropped**, and the
cached result answers it without doing the work again — re-executing a build or a model task because
an acknowledgement was lost is exactly the cost this avoids. A failed `submitOp` is logged, never
thrown: the operation stays in the platform's store and is redelivered.

Model tasks are **not executed here at all** — they are the parent agent's to run in its own clean
subagent, and what the loop owes them is delivery. The operation id is kept beside each task and
never shown to the parent: a parent that could name one could answer an operation it was never
given.

**A connector that performs no model calls says so once per task.** `openSession({ modelTasks:
false })` (a plugin edition; `true` when absent) never queues a `ModelTask` op for the parent: it is
answered `ok: false` with `ConnectOpErrorKind.Unavailable` ("this connector does not perform model
tasks") — fatal for the run, so no retry ladder runs against a connector that never will —, logged
and counted in `opsFailed`; a redelivery is answered from the result cache. Questions are still put
to the person.

A local operation that fails reports `ConnectOpErrorKind.Refused`, never `Unavailable`. The
connector ran and could not do the thing; `Unavailable` tells the platform to give up on a run that
is fine.

**The pull long-poll is the only transport.** It works through every proxy and needs no
reconnection logic, and the URL-configured host opens no session at all, so it never pulls. The
contract declares no connector socket, and `SessionStats.transport` is `'pull'` or `'none'`;
presence is refreshed by every pull and every submit.

## An answer is READ in the shapes models produce, not only the one asked for

The tool-call instruction asks for a JSON array and models mostly comply — but a single call comes
back as a bare object often enough, and some wrap the array in `{tool_calls: […]}`, that assuming
the array is a defect rather than strictness. The reference driver cast straight to an array, so a
bare object threw `parsed.map is not a function`; the TypeError was handed back AS the answer, the
model ladder read that as a bad answer and asked again with feedback that said nothing about what
was wrong, and the story failed with `retry-exceeded` having never been told. `toolCallsOf` accepts
all three shapes and still throws for an answer carrying no call at all — an empty answer is a bad
answer, and the retry is the right response to it.

The same rule is why `makeTaskEnvelopeModel(task).parseTaskResult` refuses with a described reason rather than a stack trace:
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
mechanised. Record-interaction tasks preserve their complete system instructions and JSON answer
schema, including host/parent bindings and `selectionComponents`, through every harness. They need
no navigation-specific MCP arguments: guided story tools and direct free flight share the platform's
record-placement and wiring capabilities.

For Codex, the parent gives a fresh `viable-worker` only the task's system prompt, then its
conversation, then the requested result shape: the outer handoff instruction and
`submit_task_result` call are parent-only. It passes that final response through unchanged, but must
preserve the mode: a `text` task returns the requested source or text and never a JSON tool-call
array; that array belongs only to `tools` mode.

**`makeTaskEnvelopeModel(task).parseTaskResult` refuses a malformed answer locally**, and returns a `problem` rather than
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

## Extension tools come from the host, never from this package

The catalogue is closed over what the SDK itself implements. A hosting process that offers more —
the stdio connector adds `describe_harness` and `install_harness`, which write a coding agent's
instruction, subagent and MCP files — hands them in as `ToolHost.extensions`. `catalogueHelper
.visibleTools(host)` appends them to the catalogue and filters both by `availability`, so
`registerCatalogue`, `renderPlatform` and `serverInstructions` treat an extension exactly like a
built-in tool; a host that passes none offers none, and the platform catalogue's `harness` group
renders as absent there. A group may name a tool only the catalogue or `EXTENSION_TOOLS` knows —
`platform.spec.ts` holds that line. This package never imports a host's extension: the SDK is
public, the agent-setup pair is not.

## A profile changes how a host PRESENTS the catalogue — and with none, nothing changes

`ToolHost.profile` (`ToolProfile`, `tools/profile/types.ts`) is how a store listing or a vendor
plugin offers the catalogue: pure data (`hidden`, `splits`, `presentation`, `reportClient`) plus
two functions (`instructions`, an optional `text` rewrite). `makeToolProfileModel(profile?)`
(`tools/profile.ts`) holds the mechanics, and every member is the identity when there is no
profile. `ToolHost.client` names the edition the host is.

**No profile = byte-identical output.** `tools/list` (no `outputSchema` key — a registered config
is exactly `title, description, inputSchema, annotations`), the instructions, `describe_platform`
and every result stay what they always were; published hosts and the platform's `/mcp` depend on
it. A change that alters any of them without a profile is a regression, whatever it adds.

Under a profile:

- **`visibleTools` applies it after availability**: a hidden name is dropped, a split tool is
  replaced IN PLACE by its variants, then a tool's OWN `presentation` entry overrides its title,
  description and annotations. A variant (`ToolSplitVariant`) is a tool of its own — name, title,
  description, annotations, the base input narrowed to its `fields` (the split argument never
  offered) — whose run is the base tool's with the argument fixed, whatever the call sent.
- **A declared shape is always answered.** `presentationOf(tool)` is the tool's entry; a variant
  inherits its base's `output` and `present` unless its own entry declares an `output` (a base
  presenter is never paired with a variant's own schema). `registerCatalogue` passes `outputSchema`
  only for a declared `output`, and a SUCCESSFUL call of such a tool always carries
  `present(structured ?? {}, args)` (args with the variant's fixed action) — the MCP server refuses a
  success without its declared structure. A refusal (`isError`) never carries one; a tool that
  declares no `output` keeps only its text. A presenter that throws is a defect: the answer is its
  text as `isError`, logged.
- **The text rewrite reaches every string the profile answers**: each text part, every string of
  the presented structure and what `notify` pushes. Tools in the rewrite's raw set (`read_file`)
  answer a file's content untouched.
- **The instructions are the profile's** (`profile.instructions({ host, offered })`, given only
  the names actually offered). `renderPlatform` names a catalogue tool by `namesOf` — none when
  hidden, the variants when split — so a hidden tool is never named.
- **`reportClient`**: `session_status` appends `statusTextHelper.renderClient(await api.client())`
  — the kind, version and door, and that it never performs the platform's model calls where it may
  not — and answers `{ client }`; a platform that cannot say (or a failed read, logged) is `null`.

## The listing profiles

`tools/profile/listing.ts` builds every listing with `makeListingProfile(opts)` and exports four:
`listingProfile` (the hosted listing), `claudeListingProfile` and `openaiListingProfile` (the vendor
endpoints' own objects over the shared listing tables — a rule for one vendor goes into its own
profile, never into the shared tables) and `localPluginProfile` (the stdio plugins: a local target, the workspace
paragraph added to the preface). Where each part lives:

| Part | File (under `tools/profile/`) |
|---|---|
| `LISTING_HIDDEN` — `describe_capabilities`, `describe_harness`, `install_harness`, `set_inference_mode`, `inference_settings` (`next_task` / `submit_task_result` never appear: a listing's llm is cloud) | `consts.ts` |
| `LISTING_SPLITS` — `custom_domain`, `preview_control`, `production_control`, `manage_app_user`, `manage_app_grant`, `manage_app_organization`, `manage_app_group`, one tool per `action` (`attach_custom_domain`, `start_preview`, `restart_production`, `invite_app_user`, `assign_app_grant`, `rename_app_organization`, `create_app_group`, …) | `listing/consts.local.ts` |
| `LISTING_TOOLS` — every offered tool's annotations, and its title and description where they differ | `listing/consts.local.ts` |
| The output schemas and presenters of the work domain and of the platform domain | `presentation/work.ts` (+ `work/`), `presentation/platform.ts` (+ `platform/`) |
| `session_status`'s `{ client }` shape; the merge of all of them | `listing/presentation.ts` |
| The text rewrite (`makeListingTextHelper(splits).rewrite`) and its rules | `listing/text.ts`, `listing/consts.local.ts` |
| The preface and the instruction rules | `listing/consts.local.ts`; the base text `tools/instructions.ts` |

Rules every listing holds (`listing-profile.spec.ts` pins the sets):

- **Annotations by behaviour**: destructive = may overwrite, delete, replace or rewrite code or data
  (an update, a regeneration, a develop, a discard, a revocation, a stop that ends a running thing);
  idempotent = a second identical call changes nothing more — starting paid model work again or
  adding a record never is; openWorld = an effect outside the person's account (the live production
  site, a custom domain, GitHub, a person invited by e-mail, an external repository read).
- **Descriptions say what spends credits and what repeats**, and carry nothing a listing may not:
  no recommendation over writing by hand, no delegated mode, no task loop, no harness.
- **Every offered tool declares an output** except the text-only ones (`describe_platform`,
  `delete_story`, `answer_question`, `stop_local`); a presenter keeps internal ids and timestamps
  out unless a follow-up call needs them, and always yields what its schema accepts.
- **Instructions**: the preface (what OwlMeans does, credits, confirmation, billing in the web
  application — plus the workspace note on the local plugin) stands in for the base text's opening
  paragraph, the rest is `instructionsHelper.compose(host, { namesOf, recommend: false })` naming
  only offered tools, then the instruction rules.
- **Text**: a split tool's call hint becomes its variant (`custom_domain { action: attach, … }` →
  `attach_custom_domain { … }`), a bare mention the answering variant (or every variant), a top-up
  or billing link and its call to action "managed in the OwlMeans web application", and `next_task`
  `project_status`.

## The executor is the publisher's job, on somebody's laptop

`makeLocalSlotExecutor(dir)` answers the platform's slot commands against a directory here. The
dispatcher is the publisher's, switch for switch: the platform's remote helpers parse the ANSWERS
and cannot tell whether a pod or a laptop produced one, so an ordinary failure comes back in the
same shape ("error text or null"), and only an unknown command — a protocol fault rather than a
project fault — escapes as an exception. Everything is resolved per call rather than closed over,
because a re-initialization replaces the tree under a running connector. The integrity verdict is
forgotten after every command that changes the tree, and reads the tree in the manifest's two passes
exactly as the publisher does (`targetIntegrityHelper.collectTargetFiles` + the `sources/` listing),
so a target split into apps runs here as it builds in a slot and a one-app tree answers the one-pass
report byte for byte (`tests/executor-integrity.spec.ts`).

Rules for the local executor:

- **The local browser environment defaults `APP_UNSECURE` to `true`** so its generated client
  calls the HTTP web proxy. The web `.env` can override this default; root backend secrets never
  enter the browser environment. The platform's local configure uses the web port for both
  `FRONTEND_PORT` and `BACKEND_PORT`, with `/api` proxied to the backend port.

- **`Bun` forwards `options.env` into the child process**, alongside `options.subproject` for
  its working directory. The spawn helper merges these values over the inherited environment
  without changing the parent process or the project's configuration files. Runtime probes carry
  their input in these variables; dropping them prevents the runner from producing its report.
  `executor-shell.spec.ts` exercises the public slot-command dispatcher with a real Bun child.

- **`makeTargetEnvHelper(dir).backendEnv` reads the root `.env` and `.frontendEnv` the web package's own — the file split IS
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
- **The binary pair is the publisher's, shape for shape.** `WriteBinaryFile { filePath, base64 }` →
  `{}` takes strict padded base64 of at most `SLOT_BINARY_MAX_BASE64_CHARS`, writes beside and
  renames over; `ReadBinaryFile { filePath }` → bare `{ base64, size }` reads a REGULAR file of at
  most `SLOT_BINARY_MAX_BYTES` (the write's own ceiling, from `@owlmeans/viable-common`). A symlink
  that resolves out of the project is a `SandboxPathError` — the name is confined, then what it
  resolves to; a directory, an oversized file or a bad payload is a `FileCommandRefused`; a missing
  file is the filesystem's ENOENT. `executor-binary.spec.ts` drives both through the dispatcher.
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

`makeProjectEnvHelper(dir).writeEnv` therefore reads the file with the block cut out, and replaces any block line assigning a
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
- `spawnHelper.killGroupAndWait` never returns early on the child's own exit code. The child is a shell wrapping
  `bun`, so a signal the shell dies from leaves `bun` alive while `exitCode` says gone; the wait
  polls the GROUP instead of the child's exit event.
- `spawnHelper.reclaimPort` runs before a spawn as well as after one, and matches on the script AND the process
  marker (`--viable-api`, `--viable-worker`, `--viable-boot-check`) — never a port alone, and never
  a marker alone, since reclaiming sends SIGKILL and a marker on its own matches any command line
  that merely mentions it.

## Running the generated app locally

`makeLocalRunHelper(dir).runLocal` builds and starts the api, the worker (when the project has one) and a local server that
holds the web port and proxies `/api` to the api process on the same origin — the generated app's
configuration assumes one origin, and splitting them across two loopback ports would put its CORS
setup in the path of a developer's first page load. There is no respawn ladder, no reconciler and no
health route: a developer watching their own terminal is the supervisor. What IS reproduced is the
shape — the same ports, the same argv marker, the same environment, and the same "port ownership is
the only proof" rule about restarts. Nothing from the publisher's public-hostname policy (robots,
CSP, the preview error reporter, the build-state header) is reproduced: a loopback address has no
reputation to spend and no crawler to answer.

**A split project runs every app on the one web port.** `makeLayoutHelper(dir).apps()` reads the
target's topology record (`.agents/memory/topology.md`, `appMapHelper.fromTopology`; v1, no record or
a broken map ⇒ `[main]`); `apiPath(app?)` / `webPath(app?)` resolve an app's packages (main's are the
layout's). The full `Build` builds every other app's api and web after main's (`Build { app }` one
app), each web with `targetEnv.frontendEnv(app)` (its own `.env`, `BASE_URL=/<mount>`,
`BACKEND_BASE_URL=<mount>/api`); each other api starts with `backendEnv(app)` (`appMapHelper.apiEnvOf`)
on `3000 + 10·index` under the argv marker `--viable-app=<name>` — never `--viable-api`, so main's
reclaim never takes a sibling. `createLocalServer(getWebDir, { apps })` routes by the longest prefix:
`/<mount>/api(/…)` proxied with the path kept, `/<mount>(/…)` from that app's `dist` with the SPA
fallback, `/` main's; one app (or none listed) is served exactly as a one-app tree. The run record
holds `api` (main's) and, only when split, `apps` (every app with its api); `localStatus().apps` and
`local_status` give one line per app. `run-apps.spec.ts` pins it.

`run_local` refuses to start a project whose `.env` is still missing a required key, because an app
launched without a database URL fails at boot with a message about a connection, which sends the
reader looking for a database that was never configured.

## Tests

In the `@owlmeans/viable-sdk` package directory, `bun x tsc -p tests/tsconfig.json --noEmit` checks the SDK sources and all test typings.

`bun test ./tests` — offline: the envelope and its parser, the tool catalogue and its extension seam,
the `registerCatalogue` out-of-credits, consent and planning-refusal phrasing and `notify` wiring
(`mcp-catalogue.spec.ts`; the consent marker, the bare 428/402 statuses and a consent inside a
commit failure in `catalogue.spec.ts`; the conversion confirmation — schemas and descriptions, the
start and stage phrasing, the repeat call naming a freshly filed project, the stored marker, the
bare 428 either side of `confirm`, the confirmed call's balance and consent refusals and the MCP
boundary — in `conversion-confirmation.spec.ts`; the batch, stop and steer tools — attach order, codes
resolved to card ids, the batch rendering and each final status's `next:`, cancel-then-stop, no call
without `confirm`, only the named stop fields, the stopping/steerable status lines and the three
refusals at the MCP boundary — in `run-control.spec.ts`), the executor's files/git/layout rules, and the marker + managed-`.env`
block. The story tools run over a REAL `@owlmeans/server-planning` service (memory store, the Viable
types and flows, one plugin standing in for the platform's format seam) built in `tests/context.ts`,
the landing mark included; the settings, configuration, credit, organization (`configuration.spec.ts`:
no backend value printed, the maps sent as lists, the white-label refusal phrased and notified, the
defaults copy alone, the remote routes and scopes) and planning-kit tools over a recorded `ConnectorApi` (order of
session and save or apply, the patch or kit body sent, the phrased refusal). `platform.spec.ts` pins that every tool a
pipeline, feature or group names exists, every tool is in exactly one group, every group has its
`absent` sentence, and `serverInstructions` names a tool of every group a host offers and none it hides; `planning-wiring.spec.ts` pins
the planning aliases and paths a context binds, and `remote.spec.ts` drives the remote facade, the
settings and the kit routes through a captured transport to pin their paths and deadlines, and pins that the remote
`ConnectorApi` has no member without a connector route (the `files`, `sandbox` and `slot` members by
name) and every connector alias is bound, and that a
delegated create keeps the tool deadline and sends its `sessionId`. `materials-tools.spec.ts` pins the
upload's availability per host kind and mode (and that instructions and `describe_platform` name it only
there), and drives `create_project_with_files` over the REAL remote `ConnectorApi` through a captured
transport playing the platform: refusals reported before anything is sent, the announcement, each file's
bytes streamed, the seal, a refused seal drafting with what arrived, the delegated attach before the first
file; plus `list_materials` / `read_material` and the members' routes. `call-collect.spec.ts` drives the
transport through the same captured client (`captureTransport` replaces the context's API CLIENT, so
the SDK's transport stays in front): the header only in the delegated mode and only on writes, a
reused id, pending → collect → settled for a connector call and a planning execute, a settled error
rethrown as its class, `lost` → `ConnectCallLost`, a dropped hop retried, ordinary answers untouched,
and the handover over a call that went pending. `catalogue.spec.ts` also pins the manual story moves
over the real planning service (order, the refusal, a late commit), `delete_project`
(no call without `confirm`, the required `projectId`, release → detach → destroy only for the attached
project), the annotations (declared everywhere, the destructive set, passed through `registerCatalogue`)
and the plan and integration phrasings, the cloud-only file and preview tools on both hosts with
`list_slots` everywhere, `list_files`'s kind switch (the category only with `meta`), `write_file`
attaching before its save and naming a failed rebuild, `delete_file` making no call without
`confirm`, each `preview_control` action's member, and the protected-file and missing-workload
phrasings; `conversion-confirmation.spec.ts` the proceed edits nested as
`update` and repeated in the confirmed call; `remote.spec.ts` the delete route. `handover.spec.ts` drives the delegated
`registerCatalogue` over a real task queue: a task first is the answer and the submit replies with
the call's result, a call first answers as before, an identical repeat joins the running call, a
refused call is reported in `settled[]`, `next_task` names a call still running, and a delegated
create detaches, opens an unattached session, sends its id and attaches the new project (none of it
in the cloud mode). `task-queue.spec.ts` pins the cancellable take, the non-consuming availability
and the expiry order; `session-worker.spec.ts` that a model task is delivered while a slow slot
command runs and a redelivered command runs once; `session-model-tasks.spec.ts` the `modelTasks:
false` refusal (once, `Unavailable`, logged, never queued, questions still delivered).
`client-header.spec.ts` pins `x-viable-client` on connector and planning calls and collect hops in
every mode (`sdk` by default, a differently spelled header replaced) and `client()` (404 → `null`).
`profile-seam.spec.ts` pins the seam — hidden and split tools, inherited output schemas, the
structured part on success only, a throwing presenter, the profile's instructions, `describe_platform`
naming no hidden tool, `session_status`'s client line — and that WITHOUT a profile the model is the
identity and no registration carries `outputSchema`; `listing-profile.spec.ts` the listing content
(the destructive, open-world, credit and repeating sets, the text-only tools, descriptions,
instructions, the text rewrite and its notification); `profile-presentation-{work,platform}.spec.ts`
that every presenter's output validates against its schema.

## Depends On

- `@owlmeans/viable-common` — the whole wire contract · `@owlmeans/auth-token` — the carrier guard
- `@owlmeans/client-upload` (`./node` for `fromPaths`), `@owlmeans/upload` — a new project's files
- `@owlmeans/planning` — the protocol tree, the facade contract and its refusals ·
  `@owlmeans/client-planning` — the remote facade and the long-poll commit wait
- `@owlmeans/api`, `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-config`,
  `@owlmeans/auth-common`, `@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/socket`,
  `@owlmeans/config`, `@owlmeans/context`, `@owlmeans/error`, `@owlmeans/basic-ids`
- `@modelcontextprotocol/sdk` (types only, structurally), `zod`, `fs-extra`, `globby`, `ajv`

## Blueprint discovery before project creation

`ConnectorApi.account.blueprints()` reads the installed `BlueprintCatalogue` from authenticated
`/connect/account/blueprints`, before a project or session exists. `describe_blueprints` renders and
returns its full structured catalogue: blueprint ids, stacks, resolved cases, supported application
categories, tenancy and planning resource capabilities. Both stdio MCP and platform `/mcp` expose
this same SDK tool. The platform bridges to the signed agent registry; never synthesize the deployed
catalogue from frontend presets or a closed-package import.

The remote planning facade hydrates HTTP and collected receipts with empty advisory organization
metadata (`entityId: ''`). Native organization IDs are absent from planning wire replies. Use the
authenticated organization entity slug and the planning scope lifecycle for client isolation;
never resolve permissions or organization identity from a returned planning record.

Server instructions explicitly describe the stock `owlmeans-fullstack-ts` cases: `web`, `scalable`,
`ai-pipeline`, `ai-agent`, `game`, `work-management`, `work-management-tenanted`. Work categories
include project tracking, CRM, service desk, inventory, recruiting, field service and process;
game categories include casual, online-turn and online-live. The live catalogue is authoritative
for installed custom registries. Read it before proposing a project category.


## Related

- `@owlmeans/viable-mcp-core` and its editions `@owlmeans/viable-mcp` (the npx stdio server),
  `@owlmeans/viable-claude` and `@owlmeans/viable-codex` (the plugins' local servers, on
  `localPluginProfile`) — closed-source; each skill ships in its own package
- [[auth-token]] — the credential and its carrier guard
- [[client-planning]] · [[planning]] — the facade the story tools write through
- `@owlmeans/llm-delegate` (`internal` monorepo, skill `llm-delegate`) — the other end of a model
  task, inside the platform

## Parts

| Part | Load it when |
|---|---|
| [materials](parts/materials.md) | creating a project with files from a connector, or reading a project's materials (`create_project_with_files`, `list_materials`, `read_material`, `ConnectorApi.materials`) |
