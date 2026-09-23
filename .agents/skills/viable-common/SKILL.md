---
name: viable-common
description: How to use @owlmeans/viable-common — the runtime-free contract package of the OwlMeans Viable platform. Covers planning cards and flows (including the landing-gate fields), project/story refusals, slot commands and layouts, slot metadata keys, target integrity, connector domain statuses and routes, conversion vocabulary, blueprint layer types and the case vocabulary, the ViableSkill/ViablePersona names (never the catalogue behind them), what belongs here versus in @owlmeans/viable, generated-project analysis/design/scaffold/metadata shapes, StoryDesignPort, schema conventions, and wire-version rules. Auto-invoked when importing a viable card type or flow, a slot command, a connector or conversion type, a target-integrity helper, or any *Schema this package exports.
user-invocable: false
---

# @owlmeans/viable-common

**Layer:** Cross-cutting domain (contracts only)
**Install:** `"@owlmeans/viable-common": "^0.0.32"` in `dependencies`
**Subpaths:** `.` · `./slot` · `./connect` · `./convert` · `./integrity`
**Runtime-free:** no `@langchain/*`, no filesystem, no Ajv at run time (a devDependency, for the
tests that compile the schemas). It depends on `@owlmeans/planning`, `@owlmeans/resource`,
`@owlmeans/entrypoint`, `@owlmeans/route`, `@owlmeans/error`, `@owlmeans/agent-common` and
`@owlmeans/llm-common` and on nothing else.

Every name the OwlMeans Viable platform puts on a wire, on a volume or in a prompt is declared
here once, and the four runtimes that must agree about it — the manager API, the agent, the
publisher/production runtime, and the connector SDK on somebody's laptop — all read the same
declaration. A vocabulary copied instead of imported is how one tree gets two totals, one
refusal two spellings, and one ceiling two values.

**Names, not agent-only data.** This package is imported by the BROWSER too, so everything in it
ships in every visitor's bundle. Prompt, persona and blueprint-case DATA that only the AI agent
library ever reads — never the browser or another server package — belongs in `@owlmeans/viable`
(viable-agent's `packages/library`) instead: the skill bodies and their order, the persona prompt
policies, the blueprint case table and resolution, the BA model-answer schemas. What stays here is
what another package's contract references by type — the `ViableSkill` / `ViablePersona` enums and
the `Blueprint` types and vocabulary that execution state and card fields name.

## Key Exports

| Subpath | What it declares |
|---|---|
| `.` (barrel) | The planning module (`VIABLE_*_TYPE`, `VIABLE_TYPE_SCHEMAS`, `VIABLE_FLOW_SCHEMAS`, `ViableStoryStatus`/`ViableProjectStatus` and their transitions, `ViableSpecCategory`, `ViableRelationship`, `ViableChannel`, `ViableProjectCard`/`ViableStoryCard`, the card helpers, the landing sentence helpers, the `Project*` refusals); `SlotMetadata` and the three metadata vocabularies (`metadataConfigs`, `metadataLists`, `metadataSecrets`), `BRANDING_ENV_KEYS` / `brandingEnv`; `ProjectArea` / `AREA_PATHS` / `AREA_ACCESS` / `AREA_TIER`; `ModelRole` and the viable `ExecutionState`; the `ViableSkill` / `ViablePersona` enums (names only); the `Blueprint` layer types, `BlueprintRef` / `BlueprintPatch`, `BlueprintCase` / `GameKind`, `DEFAULT_BLUEPRINT_ID` / `BLUEPRINT_META_KEY` and `landingGatePreferenceOf`; the BA shapes and helpers (`mergeConnectingStories`), the dev, UX, design and scaffold shapes and their schemas, `StoryDesignPort`; `ModerationCategory` / `ModerationSubject` / `decideModeration`; the `docs/` metadata paths; `PreviewEventType` |
| `./slot` | `SlotCommandType` and the `SlotFileCommand` / `SlotShellCommand` / `SlotGitCommand` sets, `SubProject`, `WorkloadKind`, the target ports and process markers, `slotOrigin` / `targetRedirectUrisForOrigin` |
| `./connect` | `ConnectTarget`, `ConnectLlm`, `ConnectHarness`, `ConnectExecutor`, `ConnectOpKind`, `ConnectProjectStatus`, `ConnectStoryStatus`, `ConnectPipelineState`, `ConnectWaitReason`, `ConnectProjectBranding` / `ConnectProjectBrandingSave`, `ModelTier` + `tierOfRole`/`clampTier`, `ModelTask*`, `InquiryPayload` + `ConnectInquiryKind`, the session and domain-status views, the `Connect*` error family, `connectProtocols(opts)` and every `*Schema` behind them |
| `./convert` | `ConversionStage`/`Status`/`Decision` and the `stageAfter`/`decisionFor`/`canEnter` transitions, `OriginKind`/`Shape`/`State`, `StackId` + `STACK_FAMILY`, `ArchitectureCase`, `ConvertibilityVerdict`/`Reason`, the census classifiers (`fileClassOf`, `sizeClassOf`, `entropyClassOf`, `binaryByExtension`), the `docs/conversion/` paths, `CONVERTED_ORIGIN_DIR`, `SOURCE_LIST_EXCLUSIONS`, `CENSUS_SKIP_DIRS`, `RELOCATE_ALWAYS_KEEP`, and the model-answer schemas the conversion asks with |
| `./integrity` | `TargetLayout` + `TARGET_LAYOUTS`, `detectTargetLayout`, `verifyTargetShape`, `TARGET_INTEGRITY_FILES`, `TARGET_PROTECTED_FILES`, `isLegacyLayout`, `targetPackageName` |

## The planning module

A Viable project, its user stories and the documents behind them are `@owlmeans/planning`
WORKCARDS. The planning packages own the record, the transition, the fold, the stores and the
protocol tree; this module owns what a Viable card IS — its type, its flow, its `fields`, its
slots, its code — and every runtime that writes one (the manager API, the agent, the library, the
SDK) reads that declaration from here. A plugin registers `VIABLE_TYPE_SCHEMAS` and
`VIABLE_FLOW_SCHEMAS`; nothing redeclares a type or a flow locally.

### Types

| Type | Kind | Primary flow | Code | May hold |
|---|---|---|---|---|
| `viable:project` (`VIABLE_PROJECT_TYPE`) | project | `viable:project` | slug, unique in the entity, mutable (rename, host ladder) | `viable:user-story` |
| `viable:user-story` (`VIABLE_STORY_TYPE`) | card | `viable:user-story` | `US-` + 5 uppercase, unique in the project, never changes | — |
| `viable:spec` (`VIABLE_SPEC_TYPE`) | specification | `viable:spec` (one status, `current`) | none | — |
| `viable:bug` / `viable:improvement` / `viable:requirement` | card | `viable:user-story` | `BUG-` / `IMP-` / `REQ-` | — |

The three RESERVED types are declared in full so their prefix and flow are decided once, and are
deliberately absent from the project type's `cardTypes`: nothing can create one until a feature
adds it there. A type always runs at least one flow — the planning executor has no status for a
flowless card, which is why a document runs the one-status `viable:spec` flow.

### The two flows

Story flow — the keys are the strings a story has always carried, and they are wire contracts:
the `docs/stories/<code>.md` frontmatter, the connector's story-status mapping, the board columns,
their i18n keys and every end-to-end selector read them. A key is never renamed.

| Status | Intrinsic | Tone |
|---|---|---|
| `planned` (initial) | planned | blue |
| `in-progress` | in-progress | yellow |
| `completed` | closed | green |
| `failed` | **planned** | red |

| Transition | From | To |
|---|---|---|
| `start` | `planned`, `failed` | `in-progress` |
| `complete` | `in-progress` | `completed` |
| `fail` | `in-progress` | `failed` |
| `reset` | `*` | `planned` |

`failed` is intrinsically planned: a failed story is work still to do, so "done" is the closed
count of a summary and a retry is `start` again. `reset` is the manual recovery and the only move a
completed story accepts.

Project flow:

| Status | Intrinsic | Tone |
|---|---|---|
| `draft` (initial) | planned | blue |
| `confirmed` | in-progress | yellow |
| `active` | in-progress | green |
| `archived` | closed | neutral |

`confirm` (`draft → confirmed`), `activate` (`confirmed → active`), `archive` (`* → archived`),
`reopen` (`archived → active`). A create lands at `draft`, confirming the brief is `confirm`, the end
of an initialization is `activate`. A reinitialization and a failed initialization are facts of the
SLOT, not transitions; destroying a project is a `delete` plus the platform's cascade, never
`archive`.

Every status carries a `tone` (`ViableTone`): a board draws its columns and their palette from the
flow, never from a local table.

### Where each fact lives on a card

Generic code reads only the card's top level; what is Viable's lives under `fields`, validated by
`ViableProjectFieldsSchema` / `ViableStoryFieldsSchema`. The left column is the name a fact keeps on
the wire and in target files — a parent agent's vocabulary, which never changes.

| Fact | On the card |
|---|---|
| project `id` / story `id` | `id` (a card id) |
| project `alias` | `code` |
| project `name` | `title` |
| project `description` | `description` |
| project `specification` / `vision` / `designSystem` | specification bodies, categories `specification` / `vision` / `design-system` |
| project `formerAliases`, `language`, `blueprint`, `blueprintCase`, `gameKind`, `target`, `origin`, `connectLlmMode`, `converterLlmMode` | `fields.*` |
| the landing-gate decision | project `fields.landing` — `{ story: code \| null, at }` |
| story narrative (`story`) | `title` |
| story `code` | `code` |
| story `status` | `status` (same strings) |
| story `projectId` | `parent` |
| story position in the flow | `order` — a double; a connective story sits between two flow steps (`3.5`) |
| story `area`, `primary`, `actor`, `warning`, `kind`, `landing` | `fields.*` (`kind` is persisted) |
| a story's design | specification `design` under the STORY card |
| the scaffold plan | specification `scaffold` under the PROJECT card |

`area` and `primary` are required in `ViableStoryFieldsSchema`; a create that carries no area is
still valid when it is checked, because validation runs after the planning middlewares and the
viable plugin fills the area of a narrative a person wrote. `storyFieldsOf` answers an absent area
as `guest` and an absent flag as `false`.

### The landing gate on the cards

The landing gate is the key end-user story a guest starts on the landing page and continues on its
full-scale screen after signing in. Two fields record it, and they answer different questions:

- project `fields.landing` is the DECISION, in three states: absent — never decided (a run that has
  not reached it, a project older than the gate); `{ story: null, at }` — decided, no gate;
  `{ story: <code>, at }` — that story. A failed decision is never written: `null` would read as a
  decided "none" and nothing would ask again. The schema keeps `story` nullable for exactly that
  reason, and `at` carries no `format` because the planning registry compiles without ajv-formats.
- story `fields.landing: true` marks the chosen card — at most one per project — and is what the
  design and development stages key on. `storyWriteInputOf` copies it into
  `StoryWriteInput.landing` only when set, so `StoryMeta.landing` appears only in that story's
  `docs/stories/<code>.md`; like `primary` it is the CARD's and is never passed in
  `StoryWriteContent`.

The chosen narrative also carries `LANDING_STORY_SENTENCE`, appended by `withLandingSentence` — a
note for the people reading the board, never the authority. It is idempotent (checked with
`hasLandingSentence`, whitespace-insensitive), joined with one space, and never pushes a title past
`TITLE_MAX`: a narrative with no room is returned uncut rather than truncated.

### Slots

| Card | Category | Format | Rule |
|---|---|---|---|
| project | `specification` | markdown | required |
| project | `vision`, `design-system` | markdown | |
| project | `scaffold` | json | revisioned, keeps `VIABLE_DESIGN_REVISIONS_KEPT` (3), body is a `ScaffoldPlan` |
| story | `design` | json | revisioned, keeps 3, body is a `StoryDesign` at `STORY_DESIGN_VERSION` |

The co-located `*.spec.md` / `*.ux.md` / `*.ui.md` files of a target are FILES, never slots — that
prose already lives in the `design` payload — so `SpecCategory` is not a slot vocabulary and no
type declares a `ux` or `ui` slot.

### Codes

A story CODE (`US-XXXXX`) is the target's vocabulary: every file, registry entry and widget stamp
in a generated project names the code, and a card id never reaches a target file —
`storyWriteInputOf` refuses a card with no code (`ProjectStoryMissconfigured('no-code')`) rather
than file it under its id. A project's code is its alias, minted by the platform's name ladder
(which knows retired aliases and refused hostnames); the slug policy only guards uniqueness.

### Relationships

`follows`, `shares-widget` and `shares-screen` run story → story, one each per card. Only `follows`
is WRITTEN: a connective story follows the flow story it was anchored after, created in the same
transition as the card from `MergedStoryDraft.after` (the clamped 1-based position among the flow
entries, filled by `mergeConnectingStories` and nowhere else). The two `shares-*` types are
declared only — the `scaffold` specification is their single authority, and links would be a
second answer that can disagree with it.

### The write channel

`ViableChannel` (`web`, `connect`, `agent`, `pipeline`) is what a planning write carries on
`PlanningScope.channel` and records on `actor.channel`. It is never read from the wire: the manager
API derives `connect` from an access-token request and `web` from everything else; the agent's own
writes are `agent` or `pipeline`. Three rules key on it, and `isUserChannel` is how they ask:

- the balance refusal — `ConnectOutOfCredits` for `connect`, `AgentOutOfTokens` otherwise;
- re-formatting a narrative through the analyst — `web`/`connect` only, so a pipeline-created card
  is never rewritten;
- the develop trigger — only a committed `start` written by `web`/`connect` asks for development,
  never the `start` a conversion or free flight writes for itself.

### Card helpers

`isViableProject` / `isViableStory` check kind AND type. `projectBriefOf(project, specs)` assembles
the `AgentProject` brief a generator reads (highest revision per part, `''` for a part nobody
wrote, `alias` from the code). `userStoryOf(card, design?)` builds the coders' aggregate — the card
wins on narrative, code, area and actor, the design supplies entities and screens;
`userStoryOfDesign(design)` is the design-only reading for a context with no card.
`storyDraftOf(card)` feeds the analysis prompts and moderation. `ExecutionState.projectCard` and
`TaskExecutionState.card` carry the cards as plain data beside the brief and the aggregate.

### The design port

`StoryDesignPort` is two questions addressed by CARD id — `current(cardId)` and
`put(cardId, design, { runId?, cause? })` answering the revision. The port decides which slot of
that card holds the payload (`design` for a story card, `scaffold` for the project card) and answers
`null` for a stored design of another version; the code inside a design is the target's vocabulary
and never addresses a record.

## A schema here is written for the reader that will refuse it

Two populations live side by side and are written differently on purpose. Getting the population
wrong is not a style error — each reader refuses a different thing, and one of them refuses at
boot rather than at the call.

**Model-answer schemas** are the shape a model's single JSON object must take. Annotate them
`JSONSchemaType<T>` — checked, not cast — because the answer is parsed straight back into that
type, and a schema that drifted fails at run time with a message about a document rather than
about a field.

**Record-element schemas** describe what the platform stores and puts on the wire. They are
hand-written and cast, because they are re-applied as a Mongo `$jsonSchema`, which is stricter
than Ajv: no `Record<>` maps (an open key space cannot be validated), no `integer` (a stored
number is a double), dates as ISO strings rather than objects.

Three rules hold for both, and `tests/convert.spec.ts` walks **the package barrel** for each —
not the conversion barrel, although the file is the conversion's, because none of the three
faults is particular to a conversion and a walk over one directory lets the same shape through
in a design, a slot or a connector schema:

- **`nullable: true` always carries its `type`.** Ajv refuses `nullable` on its own, and a schema
  that fails to compile takes down whatever compiled it — the route registration, the collection
  validator — instead of the one call that would have carried the value.
- **A nullable ENUM lists `null` among its values**: `enum: [...Object.values(X), null]`.
  `nullable` and `enum` are separate keywords checked independently, so the pair written apart
  widens the type check to admit `null` and then refuses that very value by enum — the field can
  only ever be OMITTED, never sent empty. Nothing fails at compile time and nothing fails for a
  caller that leaves the key out, which is why it survives review; it surfaces as the one caller
  that spells absence as `null`. Both callers exist here: a provider's structured output writes an
  unset optional as `null` (an intake stack call was retried three times and discarded as
  `llm:retry-exceeded`), and a wire body where `null` MEANS something — `llmMode`, "inherit the
  profile's setting" — has no other spelling at all.
- **`items` is never an array.** A draft-04 tuple is refused wherever the schema reaches a
  provider or a collection validator.

**A schema that validates a STORED document only grows optional.** `ScaffoldPlanSchema` is both a
model-answer schema and the validator of the project card's `scaffold` slot, so a plan written
before a field existed must still pass whenever it is carried into a new revision. Every field
added to it — the hero's `secondary`/`browse` links, `steps`, `labels`, `closing`, a feature's bento
`fragment`, the landing `gate` — is optional in the type and `nullable` in the schema, and a count
the model should respect ("4 tiles", "5–8 chips") lives in the `description` and is clamped in
code, never as `minItems`/`maxItems`. The descriptions are what the planning model reads, so they
state each field's purpose and bounds; `gate.target` is filled by code and described as such.

**A field that crosses a version skew carries no `enum`.** Users run
`npx -y @owlmeans/viable-mcp@^0.1.18-rc.29` (the moving prerelease tag) against a separately deployed
platform, so `ConnectCapabilitiesSchema.executors.items`
is a bare string: a newer executor kind must stay an unused capability on an older platform, never
a refused session. Apply the same reasoning to anything else a newer connector may send an older
platform, and nowhere else — a closed set is worth more than a tolerant one everywhere both ends
deploy together.

## One immutable protocol tree, bound in each runtime

`connectProtocols(opts)` is the connector's whole immutable HTTP and socket tree — aliases, paths,
methods, contracts and protocol parents. The manager and SDK bind their own local materializations
from those declarations, so a path or schema cannot differ across a server and client. Only what
belongs to the DEPLOYMENT is injected: the guard alias, ownership gate, paid local-LLM gate and the
platform's update-base protocol.

Adding a route means adding it here first, then binding that named protocol in every runtime that
serves or calls it. A route declared on one side alone is a 404 nobody can explain from the failing
end. Keep raw aliases private to declaration modules; consumers receive protocol objects, and a
dynamic adapter reads `.alias` only at its string-addressed boundary.

The connector tree has NO story routes. A story is a planning card, listed, created, edited,
deleted and started through the planning protocol tree the platform mounts beside the connector
(`makePlanningProtocols` in `@owlmeans/planning`) — one surface for the browser and a connector, so
a story rule cannot hold on one of them only. `ConnectProjectStatus.project` flattens the project
card into the names a parent agent reads (`name` = title, `alias` = code, the three brief bodies)
plus the card's `status` and `intrinsic` as plain strings, and `ConnectConfirmBody` carries the
three brief parts including `designSystem`.

A project's branding is read and saved at `/project/:id/branding` (`connect.project.branding.get`
GET, `.save` POST) under `base` — the guard and the ownership gate, no paid gate. The save body
(`ConnectProjectBrandingSaveSchema`) is a PATCH of strings with structural bounds only
(`CONNECT_BRANDING_*_MAX`, each equal to its twin in the platform's branding contract); what makes a
value acceptable — non-empty copyright and organization, a legal link that is `https://` or a
same-origin path, a real Google tag id — is the platform's rule, applied to the MERGED record. The
platform credit is never part of either record: hiding it is a paid capability with its own route.

Long work is read through the domain that owns it: `ConnectProjectStatus`, `ConnectStoryStatus`,
`ConversionStatusView` and `ConnectPipelineState`. Each view composes its current card/record, run,
pending inquiry and `waitingFor` reason; none exposes a generic technical operation identity. Add a
new long-running domain by extending its status view and endpoint, not by adding a parallel polling
vocabulary.

## Slot metadata keys: optional means omitted

`SlotMetadata` is what the platform signs and pushes into a slot, and a slot publisher validates it
against its own declared schema — refusing the WHOLE configuration with a 401 when the body carries
a key it does not know. A key added after slots exist is therefore OPTIONAL in the type and OMITTED
from a push while unset: `brandingGoogleTag` (in `metadataConfigs`), `cspSources` (in
`SlotListMetadata`). The build ENVIRONMENT is different — `brandingEnv` always emits every
`BRANDING_ENV_KEYS` entry, `BRANDING_GOOGLE_TAG` as `''` when unset, because the application's own
build reads `''` as "none".

`metadataConfigs` / `metadataLists` / `metadataSecrets` enumerate what an owner STORES — one
`project-config` / `project-secret` row per key, loaded on every metadata read. `cspSources` is not
an owner setting, so it is declared on the type and kept out of them. The Google tag's CSP hosts
never travel in it: the publisher derives them from `brandingGoogleTag` itself (and from the record a
production build writes), so the tag and the hosts it needs cannot disagree.

## Blueprint types and the case vocabulary

`src/blueprint/` holds only types and constants. A `Blueprint` has five REQUIRED build layers
(`technology`, `stack`, `template`, `createApp`, `packages`) and one OPTIONAL `experience` layer —
what the product should do for its users, changing no dependency and no coder prompt. Read it only
through a helper that answers the default for an absent layer: `landingGatePreferenceOf(blueprint)`
answers `LandingGatePreference.Allow` for no layer, no key or a value this deploy does not know.
An execution carries a `BlueprintRef` — an id, an optional `case` and an override patch — never a
resolved blueprint.

`BlueprintCase` (`web`, `scalable`, `ai-pipeline`, `ai-agent`, `game`) and `GameKind` are the
vocabulary a project card's `fields.blueprintCase` / `fields.gameKind` carry. What a case MEANS —
the `BLUEPRINT_CASES` table with each case's patch, landing-gate prior and persona skills,
`applyBlueprintCase`, `applyBlueprintPatch` / `freezeBlueprint`, `joinPersonaSkills` and the
classification schema — lives in `@owlmeans/viable` (its `blueprints` / `blueprint-cases` skills).
That table is typed `Record<BlueprintCase, …>`, so a member added here fails to compile there until
it has a row.

## Skill and persona names

`src/skills/` holds two enums and nothing else: `ViableSkill` (prompt-skill aliases) and
`ViablePersona` (who a helper's model is told it is). They are here because a `Blueprint`'s
`stack.skills` / `packages.skills` / `personaSkills` name them. The catalogue behind them — every
skill body (`VIABLE_SKILLS`) and weight (`SKILL_ORDER`), `FRAMEWORK_OWNED_SKILLS` /
`skillsForBlueprint`, each persona's prompt policy (`VIABLE_PERSONAS`), the design house style and
the landing-gate teaching — lives in `@owlmeans/viable` `src/skills/` (its `personas-and-skills`
skill). Adding a member here is half a change: `SKILL_ORDER` and `VIABLE_PERSONAS` are total records
and fail to compile until the new member has a weight or a policy, but `VIABLE_SKILLS` is a list,
and the prompt service skips an alias it cannot resolve — a missing body is a rule no model ever
receives.

## Closed sets that mean something

- **`ProjectArea`** — guest `/`, user `/frontoffice`, admin `/admin`, operator `/backoffice`. A
  generated product's own roles map onto `user` or `operator`; there is no fifth area. `AREA_PATHS`,
  `AREA_ACCESS` and `AREA_TIER` are total over it.
- **`TargetLayout` + `TARGET_LAYOUTS`** — the integrity manifest is PER LAYOUT. A volume never
  migrates, so a project created before the restructure stays on the legacy tree forever and must
  verify **clean**; `TARGET_INTEGRITY_FILES` is the union over layouts so a caller has both probes
  before it knows which tree it holds, and an absent layout reads as the CURRENT one.
- **`SubProject`** — a ROLE vocabulary mapped per layout, never joined onto a path. Both
  generations arrive on the wire at once, so the enum must stay total over what any live agent may
  send, and no role but `Common` may resolve to the `common` directory.
- **`ConversionStage`** — advanced only through `stageAfter` / `canEnter` / `decisionFor`. A stage
  transition computed at a call site is how a conversion re-enters a stage it already paid for.
- **`ModerationCategory`** — a wire contract with seven languages of wording behind it. A fifth
  shape is PHRASED into one of the four, never added.

## The conversion vocabulary is shared with three executors that walk the same tree

The census, listing and relocation commands are one contract with three implementations — the
SDK's local executor, the publisher's file helper, and the library's in-process helper — so
anything they could disagree about is a constant HERE rather than a matching local copy:
`CENSUS_SKIP_DIRS` (`node_modules`, `.git` — and deliberately not `dist`/`build`/`.next`, ordinary
directory names an origin may keep sources in), `SOURCE_LIST_EXCLUSIONS` (the metadata directories
plus `CONVERTED_ORIGIN_DIR`), `BINARY_PROBE_BYTES`, `CENSUS_MAX_HEAD_BYTES`, `RELOCATE_ALWAYS_KEEP`.
The one thing they are allowed to differ about is stated rather than inherited: the platform's two
keep what a volume it owns must not lose, the SDK's keeps what a DEVELOPER owns (`.viable`, the two
`.env` files).

`docs/conversion/` is likewise addressed only through the exported path builders
(`CONVERSION_*_FILE`, `conversionStoryDoc`, `conversionSeedDoc`) — a conversion's own artifacts are
read back by the purge, and a path spelled at a call site is a file the purge leaves behind.

## The inquiry vocabulary is a deliberate COPY, and the ceiling is not

`ConnectInquiryKind` / `InquiryPayload` / `InquiryAnswerPayload` mirror `@owlmeans/llm-common`'s
`Inquiry` family, renamed so both vocabularies can be imported into one file and so `manager-api`,
which does not depend on the model runtime, stays free of it. Values are byte-identical, so the
platform's mapper is a widening rather than a translation table, and a test pins that — the same
arrangement `ModelTask` has with `DelegatedTask`.

The CEILING is not copied twice over: `CONNECT_INQUIRY_MAX_TEXT` equals
`DEFAULT_INQUIRY_ANSWER_CHARS` and must stay equal, and `./convert`'s own
`INQUIRY_STATE_TEXT_CHARS` — what a pipeline STATE may keep of an answer's prose, the rest going to
`docs/conversion/inquiries.md` — equals its twin of the same name there. Two ceilings for one value means the layer with the larger one
truncates silently at the smaller, and the caller records an assumption about an answer the person
actually gave. Never introduce a local cap; import the one that exists.

## Errors: declared here, phrased where they are read

`ConnectError` and its family (`ConnectSessionNotFound`, `ConnectSessionGone`, `ConnectOpTimeout`,
`ConnectOpRefused`, `LocalSlotUnsupported`, `ConnectOpUnknown`) are `ResilientError` classes with
markers under `viable-connect:`. `ConnectSessionGone` is registered FATAL on the agent side: a run
whose executor has gone away must stop at once rather than spend a retry ladder, and the step fails
as an OUTCOME so the run row records where it stopped and `pipeline.resume` picks it up when a
connector returns.

The project and story refusals — `ProjectNotFound`, `ProjectPermissionError`,
`ProjectStoryNotFound`, `ProjectStoryMissconfigured`, `ProjectAgentOccupied` and the bases they
extend (`ProjectResourceError`, `ProjectStoryError`, `ProjectError`, `ProjectAgentError`) — ARE
declared here, because the viable planning plugin throws them from a process-neutral package.
Their type names and `viable-project:` markers are wire contracts. The platform re-exports the
whole family and never redeclares a base: a class is unmarshalled by type name with the last
registration winning, so a second declaration replaces this one and `instanceof` stops matching.

Every refusal here declares its HTTP status on its leaf class (the `error` skill's principle), and
`tests/error-status.spec.ts` refuses an exported class whose status was not decided:

| Status | Classes |
|---|---|
| 402 | `ConnectOutOfCredits` |
| 404 | `ProjectNotFound`, `ProjectStoryNotFound`, `ConnectSessionNotFound`, `ConnectOpUnknown` |
| 409 | `ProjectAgentOccupied`, `ProjectStoryMissconfigured`, `ConnectSessionGone` (no connector attached), `LocalSlotUnsupported` (the project's target) |
| 422 | `ConnectOpRefused` (the connector refused the operation) |
| none (500) | the bases, `ConnectOpTimeout` (a peer's fault), `ProjectPermissionError` (never thrown; a permission refusal extends `AuthForbidden`) |

The platform's other refusals — conversion, moderation, reserved names, integrity — are declared in
the product repo, not here, so a consumer that cannot `instanceof` them matches by MARKER instead:
`@owlmeans/viable-sdk`'s `REFUSALS` map and the manager's `useErrorPhrase` read the same substrings,
which is what stops one refusal being phrased two ways. When a marker changes, both readers change
with it.

## Tests

`bun test ./tests` — offline. `planning.spec.ts` (the story and project flows through the planning
helpers — status keys as literals, `failed` intrinsically planned, the transition table — the type
declarations, slots with no co-located category, code policies, reserved types outside `cardTypes`,
the field schemas accepting `null` and refusing an undeclared field or a value outside a closed
set, the landing fields and the landing sentence, the card helpers, the `follows` anchor, and the
refusals' type names surviving a marshal), `scaffold.spec.ts` (an old-shape and a new-shape plan
both passing the schema and the `scaffold` slot, `null` optionals accepted, no `minItems`),
`blueprint.spec.ts` (`landingGatePreferenceOf` — the default for an absent layer or an unknown
value), `branding.spec.ts` (the build env and the metadata vocabulary),
`connect-entrypoints.spec.ts` (the tree's protocol count, no story route, the job-id round trip,
the branding routes and their save body),
`convert.spec.ts` (the three structural walks over the barrel, the
conversion schemas compiling, a nullable enum accepting `null` under Ajv while still refusing an
unknown member, the census classifiers and the stage transitions), `connect-convert.spec.ts` (the
conversion routes at their paths and methods, hanging under the connector base and carrying no paid
gate; capabilities accepting an executor kind this platform has never heard of; the answer and
resume bodies), `design.spec.ts` (the design aggregate, staleness ranking, and the design schema
refusing an undeclared field or an area outside the closed set, and `userStoryOfDesign`),
`error-status.spec.ts` (every exported refusal's declared status, and its class and status after a
marshal round trip).

## Depends On

- `@owlmeans/planning` — the workcard contracts the planning module declares its types over
- `@owlmeans/resource` — the `ResourceError` base of the project refusals
- `@owlmeans/entrypoint`, `@owlmeans/route` — the entrypoint declarations
- `@owlmeans/error` — the `Connect*` error family
- `@owlmeans/llm-common` — `ExecutionEffort`/`ExecutionLevel`, `LlmPurpose`, the spectator
  contracts, and the inquiry ceilings this package's copies are pinned to
- `@owlmeans/agent-common` — the run and pipeline contracts a conversion's runs are declared against

## Related

- [[viable-sdk]] — the connector SDK written entirely against these contracts
- [[viable-mcp]] — the npx stdio server built on that SDK
- [[inquiry]] — the primitive `InquiryPayload` mirrors, and the one answer ceiling
- [[llm-common]] — the contracts half of the model runtime
- [[planning]] — the workcard model, flows, fold and protocol tree the planning module builds on
- The DOMAIN rules for what these shapes mean — target areas and navigation, the scaffold, target
  integrity, the metadata files, the converter — live in the downstream repos that implement them
  (`target-areas`, `scaffolding`, `workload-integrity`, `viable-metadata`, `converter`). This skill
  owns the CONTRACT: how a name is declared, and what refuses it.
