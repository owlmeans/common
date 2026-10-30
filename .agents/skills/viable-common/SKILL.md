---
name: viable-common
description: How to use @owlmeans/viable-common — the runtime-free contract package of the OwlMeans Viable platform. Covers planning cards and flows (including the landing-gate and tenancy fields), project/story refusals, slot commands and layouts, slot metadata keys, target integrity, connector domain statuses and routes, the intent-first hand-off (`./intent`), shared legal dates (`./legal`), conversion vocabulary, blueprint layer types and case vocabulary, ViableSkill/ViablePersona names, what belongs here versus in @owlmeans/viable, generated-project analysis/design/scaffold/metadata shapes, StoryDesignPort, schema conventions, and wire-version rules. Auto-invoked when importing a viable card type or flow, a slot command, a connector or conversion type, legal dates, a target-integrity helper, or any *Schema this package exports.
user-invocable: false
---

# @owlmeans/viable-common

**Layer:** Cross-cutting domain (contracts only)
**Install:** `"@owlmeans/viable-common": "^0.1.19-rc.0"` in `dependencies`
**Subpaths:** `.` · `./slot` · `./connect` · `./convert` · `./integrity` · `./intent` · `./legal` · `./iam-console` — the barrel
re-exports every subpath except `./intent`.
**Runtime-free:** no `@langchain/*`, no filesystem, no Ajv at run time (a devDependency, for the
tests that compile the schemas); it depends on the packages under Depends On and nothing else.

Every name the Viable platform puts on a wire, on a volume or in a prompt is declared here once,
and the runtimes that must agree about it — the platform's API services, the agent, the
publisher/production runtime and the connector SDK on somebody's laptop — read the same
declaration. A vocabulary copied instead of imported is how one tree gets two totals, one refusal
two spellings and one ceiling two values.

**Names, not agent-only data.** The BROWSER imports this package, so everything in it ships in
every visitor's bundle. Data only the AI agent library reads — skill bodies and their order,
persona prompt policies, the blueprint case table and its resolution, the BA model-answer schemas
— belongs in `@owlmeans/viable`. What stays here is what another package's contract references by
type: the `ViableSkill` / `ViablePersona` enums and the `Blueprint` types and vocabulary that
execution state and card fields name.


## Record interaction contracts

`RecordInteractionPlan` and `RecordInteractionPlanSchema` describe domain destinations and contextual
CRUDL capabilities: entity/owner, host screen/component, primary selection components, presentation
and record/parent bindings. `selectionComponents` carries actual list/board/picker source paths whose
record-open controls enter the same detail as its contextual actions; it is optional for legacy reads.
Optional `componentResponsibilities` assigns entity, roles, capabilities, scope and nested parent to
each allocated component. Roles are collection/detail/editor/owned-section/support; one component may
bind several entities. `StoryDesignApi.operations` optionally limits an endpoint group to the
current story's required list/get/create/update/remove operations. These additions preserve old plans.
Optional `interaction` fields on scaffold, design and target metadata preserve legacy reads; the
scaffold model answer requires one for each story. `recordInteractionHelper` separates host menu
eligibility from editor route parameters. These are runtime-free contracts; generation prompts and
wiring implementations belong to viable-agent. Pipeline and shape-version constants remain 1.

## Key Exports

| Subpath | What it declares |
|---|---|
| `.` (barrel) | The planning module (`VIABLE_*_TYPE`, `VIABLE_TYPE_SCHEMAS`, `VIABLE_FLOW_SCHEMAS`, `ViableStoryStatus`/`ViableProjectStatus` and their transitions, `ViableSpecCategory`, `ViableRelationship`, `ViableChannel`, `ViableProjectCard`/`ViableStoryCard`, the card helpers, the landing sentence helpers, the `Project*` refusals); `SlotMetadata` and the three metadata vocabularies (`metadataConfigs`, `metadataLists`, `metadataSecrets`), `BRANDING_ENV_KEYS` / `brandingEnv`; `ProjectArea` / `AREA_PATHS` / `AREA_ACCESS` / `AREA_TIER`, `ADMIN_PERMISSION` / `OPERATOR_PERMISSION`; the tenancy contract (`ProjectTenancy`, `ViableTenancyDecision` (+ `origin?`), `OriginTenancyFacts`, `NO_TENANCY`, `tenancyHelper` (`tenancyOf`, `tenantedArea`), `TENANCY_QUOTE_MAX`, `ORIGIN_TENANCY_WORD_MAX` / `ORIGIN_TENANCY_LIST_MAX`); `ModelRole` and the viable `ExecutionState` (+ `originTenancy?`); the `ViableSkill` / `ViablePersona` enums; the `Blueprint` layer types, `BlueprintRef` / `BlueprintPatch`, `BlueprintCase` / `GameKind` / `WorkKind` / `BotKit` / `BotKitAction`, `BotPlatform` (re-exported from `@owlmeans/bot`), `CASE_QUOTE_MAX`, `DEFAULT_BLUEPRINT_ID` / `BLUEPRINT_META_KEY`, `landingGatePreferenceOf`; the target topology (`TopologyDescriptor`, `LAYOUT_TOPOLOGIES`, `topologyHelper` (`resolveTopology`, `packageForRole`) — meaning in `/blueprints`); the BA shapes (`connectingStoryHelper.mergeConnectingStories`; the stated requirements — `StatedRequirement`, `RequirementsDocument`, `RequirementPart` / `RequirementKind` / `RequirementSource`, `requirementsHelper`, `RequirementsDocumentSchema` / `StatedRequirementSchema`), the dev (`AccessBlock`, `AccessLevel`, `PermissionDefault`), UX, design and scaffold shapes and their schemas (with `StoryDesignBotHandler` / `StoryDesignBotTrigger`, `STORY_BOT_TRIGGERS`, `storyRuntimeHelper.botHandlersOf`), `StoryDesignPort`; `ModerationCategory` / `ModerationSubject` / `moderationVerdictHelper.decideModeration`; the `docs/` metadata paths; `PreviewEventType` (error kinds plus `Analytics` — an analytics event a target's web posted through the preview reporter's channel; the target-side plugins live in `@owlmeans/viable-log`) and the `OwlMeansAnalyticsPayload` shape; the agent-output taxonomy (`agentPresentationHelper` — `classifyAgentMessage`, `isAgentMessageHidden`; `/agent-presentation`) and the spectator entry types; the story batch and the agent controls (`src/batch/`, below) |
| `./slot` | `SlotCommandType` and the `SlotFileCommand` / `SlotShellCommand` / `SlotGitCommand` / `SlotDatabaseCommand` sets; `SlotDatabaseInfo`, `SlotDatabaseQueryArgs` / `SlotDatabaseQueryResult`, `DATABASE_READ_LIMITS`; the per-command deadlines and timeouts (`slotCommandHelper` — `commandDeadline`, `commandTimeout`), `SubProject`, `LAYOUTS` / `ROLE_DIRS` / `slotLayoutHelper.subprojectDirOf`, `WorkloadKind`, the target ports and process markers, `slotOriginHelper` (`slotOrigin` / `targetRedirectUrisForOrigin`) |
| `./connect` | `ConnectTarget`, `ConnectLlm`, `ConnectHarness`, `ConnectExecutor`, `ConnectOpKind`, `ConnectProjectStatus`, `ConnectStoryStatus`, `ConnectPipelineState`, `ConnectWaitReason`, `ConnectProjectBranding` / `ConnectProjectBrandingSave` / `ConnectProjectBrandingFields` / `ConnectBrandingCredit` / `ConnectBrandingCreditBody`, the configuration contract (`ConnectScopeQuery`, `ConnectConfigScope`, `ConnectProjectConfig`, `ConnectConfigVariable`, `ConnectFrontendVariable`, `ConnectConfigValue`, `ConnectConfigSaveBody`, `CONNECT_CONFIG_*`), the organization's defaults (`ConnectOrganizationBranding(Save)`, `ConnectBrandingBackfill`), the planning-kit views (`PlanningKitView`, `ConnectKitDescribe`, `ConnectKitApplyBody`, `ConnectKitApplyResult` and their `*Schema`s), `ModelTier` + `modelTierHelper` (`tierOfRole`/`clampTier`), `ModelTask*`, `InquiryPayload` + `ConnectInquiryKind`, the session and domain-status views, the convert bodies (`ConnectConvertCreateBody`, `ConnectConvertStartBody`, `ConnectConvertProceedBody` + `ConnectConvertProceedUpdate`), `ConnectAgentLock`, `ConnectPaidGate` + `ConnectGateRef` + `ConnectEntrypointOptions`, the call collection (`CONNECT_CALL_HEADER`, `CONNECT_CALL_ACCEPT_MS`, `CONNECT_CALL_COLLECT_WAIT_SEC`, `CONNECT_CALL_LOST_MS`, `ConnectCallState`, `ConnectCallPending`, `ConnectCallResult`, `ConnectCallCollectParams` / `ConnectCallCollectQuery` and their `*Schema`s), the `Connect*` error family with `ConnectConfirmation` / `ConnectConfirmationAction`, `connectProtocols(opts)` and every `*Schema` behind them |
| `./convert` | `ConversionStage`/`Status`/`Decision` and the `conversionStageHelper` transitions (`stageAfter`/`decisionFor`/`canEnter`), `OriginKind`/`OriginShape`/`OriginState`, `StackId` + `STACK_FAMILY`, `ArchitectureCase`, `ConvertibilityVerdict`/`ConvertibilityReason`, the census classifiers (`censusHelper` — `fileClassOf`, `sizeClassOf`, `entropyClassOf`, `binaryByExtension`), the `docs/conversion/` paths, `CONVERTED_ORIGIN_DIR`, `SOURCE_LIST_EXCLUSIONS`, `CENSUS_SKIP_DIRS`, `RELOCATE_ALWAYS_KEEP`, the flow census and its consolidation (`OriginFlowEntry` — a census flow without proofs, `OriginFlowConsolidation(Schema)`, the settled `OriginStoryPlan`, `OriginFlowDisposition`, the CLOSED `PlatformFlow` — its two organization flows only through `TENANT_PLATFORM_FLOWS`), the origin's tenancy (`OriginTenancy`, `OriginTenant`, `OriginTenancyPart`, `OriginTenancyRecord`, the model-facing `OriginTenancyAnswer(Schema)`, `CONVERSION_TENANCY_FILE`), the whole-file summaries (`FileSummary` and its parts, the model-facing `FileSummaryAnswer` / `FileSummaryBatch(Schema)`, `CONVERSION_SUMMARY_DIR`, `CONVERSION_SUMMARY_ROOT`, `SummaryDocMeta`), the origin's own types (`OriginTypeSpec` and its `OriginTypeAttribute` / `OriginTypeRelation`, `OriginDefinition`, `OriginTypeRepresentation`, the definitions facts `OriginDefinitionFacts` — type, flow, container, card — with `OriginFieldSchema`, `OriginTypesRecord`, `OriginTypesDocMeta`, `originTypesHelper` (`recordOf`, `definitionsOf`, `entityOf`), `CONVERSION_TYPES_FILE`, `ORIGIN_DEFINITIONS_SECTION`), the estimator's `RolePlanEntry` (`perStory`, `perWindow`), and the model-answer schemas the conversion asks with |
| `./integrity` | `TargetLayout` + `TARGET_LAYOUTS`, `targetLayoutHelper` (`detectTargetLayout`, `isLegacyLayout`, `targetPackageName`), `targetIntegrityHelper.verifyTargetShape`, `TARGET_INTEGRITY_FILES`, `TARGET_PROTECTED_FILES` |
| `./intent` | `intent` (the six aliases), `makeIntentProtocols(opts?)`, `intentFlow` + `IntentFlowStep` + `INTENT_PAYLOAD_REF`, `IntentStashBodySchema` / `IntentPickupBodySchema`, the `INTENT_*` constants (`INTENT_IMPORT_PATH`, `INTENT_PRO_PATH`, `INTENT_IMPORT_KIND` included), `IntentDraft` / `IntentImportDraft`, `IntentExpired` (404) / `IntentThrottled` (429) |
| `./iam-console` | The owner console's IAM contract both doors share (the browser's `back.iam`, the connector's `connect.iam`): the route params (`IamProjectParams`, `IamProjectUserParams`, `IamOrganizationParams`, `IamMemberParams`, `IamGroupParams`), `IamScoped`, the bodies (`IamDefinitionUpdate`, `IamStaffSync`, `IamAssignGrant` / `IamRevokeGrant`, `IamGrantsQuery`, `IamProjectUserInvite` / `Update`, `IamOrganizationEdit`, `IamProjectMemberInvite` / `Update`, `IamGroupCreate` / `Edit`, `IamGroupMembersChange`), the answers (`IamListResponse` + `external`, `IamUsersResponse`, `IamPermissionsResponse` + `IamTenancy`, …, `IamStaffSyncResponse`), every `Iam*Schema` (with `IamScopedSchema`, `IamGroupRefSchema`), `IAM_REFUSED`, and the `@owlmeans/iam` vocabulary re-exported (`IamDefaultClass`, `IamGrantMode`, `IamGrantOrigin`, `IamRemovalPolicy`, `IAM_AREAS`, `IAM_MEMBERS_GROUP`, the record types). The refusal's CLASS (`IamRefused`, 409) is the platform's |
| `./legal` | `OWLMEANS_LEGAL_DATES`, `LegalDocumentDates`, `PendingLegalDocumentDates`, `LegalDocumentDateMetadata`, `LegalDocumentKey` — active dates and pending metadata for public legal sources and acceptance |

## Shared legal dates (`./legal`)

Import `OWLMEANS_LEGAL_DATES` from `@owlmeans/viable-common/legal` for legal-page builds and
platform consent configuration. This subpath has no runtime imports; it loads only the date table.
The package barrel also re-exports it. Never import another repository's sources by path.

`src/legal/consts.ts` owns active ISO `YYYY-MM-DD` effective/updated dates and pending entries with
`status: 'pending'`, `effective: null`, `updated: null`. `src/legal/types.ts` declares active and
pending shapes, their `LegalDocumentDateMetadata` union, and the complete `LegalDocumentKey` union.
A new document must add both a key and a table row;
`satisfies Record<LegalDocumentKey, LegalDocumentDateMetadata>` checks coverage.
Format dates in the consumer's locale, keeping policy text as placeholders rather than copied dates.

The Platform accepts `terms` and `platform-license` (combined subscription/billing), with privacy
disclosed separately; product-use rules live in Terms. `billing` and `product` preserve historical
acceptance dates as compatibility aliases. DPA (`data-processing-agreement`), subprocessor (`subprocessors`), company-notice
(`company-information`), acceptable-use (`acceptable-use`), refund (`refund-cancellation`) and
service-level (`service-level-agreement`) entries remain pending until coordinated release.
Render an explicit pending notice for a pending entry; never send null to a date formatter or
substitute a preparation date. Optional purposes carry independent wording revisions in the consuming
app, so editing privacy alone must not enlarge an existing grant. Legal-date activation is coordinated
with publication and the configured acceptance digest. Rebuild this package before the platform and
static-site consumers; both must receive the same table revision.

## The planning module

A Viable project, its user stories and the documents behind them are `@owlmeans/planning`
WORKCARDS. The planning packages own the record, transition, fold, stores and protocol tree
(`/planning`); this module owns what a Viable card IS — its type, flow, `fields`, slots and code.
A plugin registers `VIABLE_TYPE_SCHEMAS` and `VIABLE_FLOW_SCHEMAS`; nothing redeclares a type or a
flow locally.

### Types

| Type | Kind | Primary flow | Code | May hold |
|---|---|---|---|---|
| `viable:project` (`VIABLE_PROJECT_TYPE`) | project | `viable:project` | slug, unique in the organization, mutable (rename, host ladder) | `viable:user-story` |
| `viable:user-story` (`VIABLE_STORY_TYPE`) | card | `viable:user-story` | `US-` + 5 uppercase, unique in the project, never changes | — |
| `viable:spec` (`VIABLE_SPEC_TYPE`) | specification | `viable:spec` (one status, `current`) | none | — |
| `viable:bug` / `viable:improvement` / `viable:requirement` | card | `viable:user-story` | `BUG-` / `IMP-` / `REQ-` | — |

The three RESERVED types are declared in full so their prefix and flow are decided once, and are
absent from the project type's `cardTypes`: nothing creates one until a feature adds it there. A
type always runs a flow — the planning executor has no status for a flowless card, so a document
runs the one-status `viable:spec` flow.

### The two flows

Story flow — the keys are wire contracts (the `docs/stories/<code>.md` frontmatter, the
connector's story-status mapping, the board columns, their i18n keys, every e2e selector), and a
key is never renamed.

| Status | Intrinsic | Tone | | Transition | From | To |
|---|---|---|---|---|---|---|
| `planned` (initial) | planned | blue | | `start` | `planned`, `failed` | `in-progress` |
| `in-progress` | in-progress | yellow | | `complete` | `in-progress` | `completed` |
| `completed` | closed | green | | `fail` | `in-progress` | `failed` |
| `failed` | **planned** | red | | `reset` | `*` | `planned` |

`failed` is intrinsically planned: a failed story is work still to do, so "done" is the closed
count and a retry is `start` again. `reset` is the manual recovery and the only move a completed
story accepts.

Project flow: `draft` (initial; planned, blue), `confirmed` (in-progress, yellow), `active`
(in-progress, green), `archived` (closed, neutral); `confirm` (`draft → confirmed`), `activate`
(`confirmed → active`), `archive` (`* → archived`), `reopen` (`archived → active`). A create lands
at `draft`, confirming the brief is `confirm`, the end of an initialization is `activate`. A
reinitialization and a failed initialization are facts of the SLOT, not transitions; destroying a
project is a `delete` plus the platform's cascade, never `archive`.

Every status carries a `tone` (`ViableTone`): a board draws its columns and palette from the flow,
never from a local table.

### Where each fact lives on a card

Generic code reads only the card's top level; what is Viable's lives under `fields`, validated by
`ViableProjectFieldsSchema` / `ViableStoryFieldsSchema`. The left column is the name a fact keeps on
the wire and in target files — a parent agent's vocabulary, which never changes.

| Fact | On the card |
|---|---|
| project `id` / story `id` | `id` (a card id) |
| project `alias` / `name` / `description` | `code` / `title` / `description` |
| project `specification` / `vision` / `designSystem` | specification bodies, categories `specification` / `vision` / `design-system` |
| project `formerAliases`, `language`, `blueprint`, `blueprintCase`, `gameKind`, `workKind`, `botPlatforms`, `botKit`, `caseQuote`, `target`, `origin`, `connectLlmMode` | `fields.*` |
| the landing-gate decision | project `fields.landing` — `{ story: code \| null, at }` |
| the tenancy decision | project `fields.tenancy` — `ViableTenancyDecision` `{ operators, users, quotes?, by: 'model' \| 'owner', at, origin? }`; `origin` (`OriginTenancyFacts { label, keys, people }`, words ≤ 64, lists ≤ 8) only on a conversion whose origin kept tenants |
| story narrative (`story`) / `code` / `status` | `title` / `code` / `status` (same strings) |
| the text a person typed for a story, verbatim | `description` (the viable plugin keeps it; `title` is the formatted reading) |
| story `projectId` | `parent` |
| story position in the flow | `order` — a double; a connective story sits between two flow steps (`3.5`) |
| story `area`, `primary`, `actor`, `warning`, `kind`, `landing` | `fields.*` |
| a story's design / the scaffold plan | specification `design` under the STORY card / `scaffold` under the PROJECT card |
| the stated requirements | specification `requirements` — every one with its story codes under the PROJECT card, a story's slice under the STORY card |

`area` and `primary` are required in `ViableStoryFieldsSchema`; a create without an area still
validates, because validation runs after the planning middlewares and the viable plugin fills the
area of a narrative a person wrote. `viableCardHelper.storyFieldsOf` answers an absent area as `guest` and an
absent flag as `false`.

### The landing gate on the cards

The landing gate is the key end-user story a guest starts on the landing page and continues on its
full-scale screen after signing in (`/target-areas`). Two fields record it:

- project `fields.landing` is the DECISION, in three states: absent — never decided;
  `{ story: null, at }` — decided, no gate; `{ story: <code>, at }` — that story. A failed decision
  is never written, since `null` would read as a decided "none" that nothing asks again. `at`
  carries no `format` because the planning registry compiles without ajv-formats.
- story `fields.landing: true` marks the chosen card — at most one per project — and is what design
  and development key on. `viableCardHelper.storyWriteInputOf` copies it into `StoryWriteInput.landing` only when
  set, so `StoryMeta.landing` appears only in that story's `docs/stories/<code>.md`; like `primary`
  it is the CARD's and is never passed in `StoryWriteContent`.

`landingSentenceHelper.withLandingSentence` appends `LANDING_STORY_SENTENCE` to the chosen narrative — a note for people
reading the board, never the authority. It is idempotent (`.hasLandingSentence`,
whitespace-insensitive), joins with one space, and never pushes a title past `TITLE_MAX`: a
narrative with no room is returned uncut.

### The tenancy decision on the card

`ProjectTenancy` is two independent flags: `operators` (the back office's staff split into tenant
organizations) and `users` (end users distributed across tenant organizations). An organization is
an IAM-managed tenant, never a table the target keeps; both flags off is a single-organization
application, the project owner's, that every person acts in.

- project `fields.tenancy` (`ViableTenancyDecision`): ABSENT means never decided and reads as
  single-organization; a recorded one always carries BOTH flags, `by` (`'model'` inferred,
  `'owner'` set) and `at`, and may carry `quotes` — the requester's own sentences, verbatim, each
  at most `TENANCY_QUOTE_MAX` (1024) characters. A partial decision, another decider or a stray key
  is refused.
- It reaches a run only through `BlueprintRef.tenancy`, and only when a flag is on; resolution
  alone writes it into `experience.tenancy` — never a blueprint or a case table. Read it through
  `tenancyHelper.tenancyOf(blueprint)`: `NO_TENANCY` (frozen, both off) for no blueprint, layer, key or an
  unreadable value — only a literal `true` turns a flag on.
- `tenancyHelper.tenantedArea(area, tenancy)` — `user` follows `users`, `operator` follows `operators`; `guest`
  and `admin` (the project owner, above every tenant) are never tenanted.
- Classification, the access policy, per-record kinds and the IAM client config live in
  `@owlmeans/viable` (`/target-tenancy`).

### Binary slot files

`SlotFileCommand.WriteBinaryFile` uses `{ filePath, base64 }` and answers `{}`. It carries image
bytes and atomic manifests through the existing signed file-command transport. Executors validate
and confine paths and decode bounded strict base64; text writes are not a binary transport.

### Slots, codes, relationships

| Card | Category | Format | Rule |
|---|---|---|---|
| project | `specification` | markdown | required |
| project | `vision`, `design-system` | markdown | |
| project | `scaffold` | json | revisioned, keeps `VIABLE_DESIGN_REVISIONS_KEPT` (3), body is a `ScaffoldPlan` |
| project | `requirements` | json | revisioned, keeps 3, body is a `RequirementsDocument` at `REQUIREMENTS_VERSION` |
| story | `design` | json | revisioned, keeps 3, body is a `StoryDesign` at `STORY_DESIGN_VERSION` |
| story | `requirements` | json | as on the project; the story's slice plus its own `S…` items |

The co-located `*.spec.md` / `*.ux.md` / `*.ui.md` files of a target are FILES, never slots — that
prose lives in the `design` payload — so no type declares a `ux` or `ui` slot.

A story CODE (`US-XXXXX`) is the target's vocabulary: every file, registry entry and widget stamp
names the code, and a card id never reaches a target file — `viableCardHelper.storyWriteInputOf` refuses a card
with no code (`ProjectStoryMissconfigured('no-code')`). A project's code is its alias, minted by
the platform's name ladder; the slug policy only guards uniqueness.

`follows`, `shares-widget` and `shares-screen` run story → story. Only `follows` is WRITTEN: a
connective or an anchored requested story follows the flow story it was anchored after, created in
the same transition from `MergedStoryDraft.after` (the clamped 1-based position, filled by
`connectingStoryHelper.mergeConnectingStories` and `requirementsHelper.mergeRequested` alone).
The `shares-*` types are declared only — the `scaffold` specification is their single authority.

### The write channel

`ViableChannel` (`web`, `connect`, `agent`, `pipeline`) is what a planning write carries on
`PlanningScope.channel` and records on `actor.channel`. It is never read from the wire: the API
services derive `connect` from an access-token request and `web` from everything else; the agent's
own writes are `agent` or `pipeline`. Four rules ask `viableCardHelper.isUserChannel`:

- the balance refusal — `ConnectOutOfCredits` for `connect`, `AgentOutOfTokens` otherwise;
- re-formatting a narrative through the analyst — `web`/`connect` only;
- extracting a story's own requirements — a committed story create or title update by `web`/`connect`;
- the develop trigger — only a committed `start` written by `web`/`connect`, never the `start` a
  conversion or free flight writes for itself.

### Stated requirements

The requester's prompt is split into explicit requirements, each quoted verbatim: `R1`, `R2`, … from
the prompt (`RequirementSource.Prompt`), `S1`, … from a story a person typed (`Story`). A
`StatedRequirement` carries a `kind` (`story` — a kind of user does something; `rule` — how something
must work, be stored, look or behave; `platform` — the platform provides it; `unsupported` — a stack
the platform replaces, `note` says what it does instead), a testable `statement`, and up to four
`parts` (`RequirementPart`: `tech`, `ba`, `ux`, `ui` — what each level must do), `packages`
(`{ name, side: SubProject }`) and, on the project document only, `stories` — the story codes it applies to.
Caps: `REQUIREMENTS_CAP` (40) per prompt, `REQUESTED_STORY_CAP` (12), `STORY_SPLIT_CAP` (3).

- A story no main-flow step covers is `StoryKind.Requested` — never primary, never a landing
  candidate; `requirementsHelper.mergeRequested` places `RequestedStoryDraft`s after the last entry of
  their anchor flow story (unanchored at the end, deduplicated by text, capped).
- `requirementsHelper` is pure and byte-stable (code-unit order, no clock): `compareIds` (`R` before
  `S`, numeric), `partsOf`, `card` (the model-facing markdown, `''` when empty, every `@owlmeans/`
  scope stripped so a package-detection plugin never fires on it), `specificationSections` (sections
  5–9 of the specification, titles `REQUIREMENTS_SECTION_*`, lines marked `**R<n>**`),
  `idsInSpecification` / `retained` (a confirmed specification keeps only the items whose marker a
  person left in it), `sliceFor`, `frontmatterOf` (`StoryMeta.requirements`, ids per part),
  `requirementsFile` (the target's `REQUIREMENTS_FILE`, `docs/requirements.md`) and `digest`.
- A design carries its story's `requirements` and records `provenance.requirementsHash` (the
  `digest`); `designStaleness` answers `Narrative` when the hash moved (absent reads as `''`), checked
  right after the narrative itself. `emptyStoryDesign` adds neither key.

### Card helpers and the design port

`viableCardHelper.isViableProject` / `.isViableStory` check kind AND type. `viableSpecHelper.projectBriefOf(project, specs)` assembles
the `AgentProject` brief (highest revision per part, `''` for an unwritten part, `alias` from the
code). `viableCardHelper.userStoryOf(card, design?)` builds the coders' aggregate — the card wins on narrative,
code, area and actor, the design supplies entities and screens; `storyDesignHelper.userStoryOfDesign(design)` is the
design-only reading. `viableCardHelper.storyDraftOf(card)` feeds the analysis prompts and moderation.
`ExecutionState.projectCard` and `TaskExecutionState.card` carry the cards as plain data.

`StoryDesignPort` is addressed by CARD id — `current(cardId)` and
`put(cardId, design, { runId?, cause? })` answering the revision. The port picks the slot (`design`
for a story, `scaffold` for the project) and answers `null` for a stored design of another
version; the code inside a design never addresses a record.

## A schema here is written for the reader that will refuse it

**Model-answer schemas** — the shape of a model's single JSON object — are annotated
`JSONSchemaType<T>` (checked, not cast), because the answer is parsed straight back into that type.

**Record-element schemas** — what the platform stores and puts on the wire — are hand-written and
cast, because they are re-applied as a Mongo `$jsonSchema`, stricter than Ajv: no `Record<>` maps,
no `integer` (a stored number is a double), dates as ISO strings.

Three rules hold for both; `tests/convert.spec.ts` walks the PACKAGE barrel for each:

- **`nullable: true` always carries its `type`.** Ajv refuses `nullable` alone, and a schema that
  fails to compile takes down whatever compiled it (route registration, collection validator).
- **A nullable ENUM lists `null` among its values**: `enum: [...Object.values(X), null]`. Written
  apart, the type check admits `null` and the enum refuses it, so the field can only be omitted.
  Both kinds of caller send `null`: a provider's structured output for an unset optional, and a
  wire body where `null` MEANS something (`llmMode` — "inherit the profile's setting").
- **`items` is never an array.** A draft-04 tuple is refused by providers and collection validators.

**A model-answer property is never NAMED like a schema keyword** (`required`, `default`, `format`,
`minimum`, …): a provider strips such a property from what the model is shown, so it can never be
answered. `@owlmeans/viable`'s `tests/utils/model-schema.test.ts` walks every schema this package
exports. Name the field for its meaning and keep the stored type separate: the stored
`FileSummaryField` says `required` / `default`, its model twin `FileSummaryAnswerField` says
`mandatory` / `defaultValue`, and the converter maps one onto the other.

**A schema that validates a STORED document only grows optional.** `ScaffoldPlanSchema` is both a
model-answer schema and the `scaffold` slot's validator, so an older plan must still pass when
carried into a new revision: every added field is optional in the type and `nullable` in the
schema, and a count the model should respect lives in the `description` and is clamped in code,
never as `minItems`/`maxItems`. The descriptions are what the planning model reads; `gate.target`
is filled by code and described as such.

**One reading of the landing page.** What a guest home draws is decided by the pure
`landingPlanHelper` beside the schema, never re-derived by a consumer: `landingBandsOf` (the bands, in `LANDING_BAND_ORDER`,
one presence rule each), `landingMenuOf` (the header menu: present bands only, page order, capped,
padded to `LANDING_MENU.min`) and `homeSlotsOf` (the buttons a home link can attach to; a gate with
fields removes `LANDING_GATE_SLOTS`). The optional bands (`useCases`, `differentiator`, `approach`,
`about`) each carry a `basis` copied word for word from a source and checked downstream;
`testimonials` is optional; `links` absent/`null` means undecided, `[]` decided none.
`linksDecided` (optional, nullable, strings) lists the story codes whose links were decided at
DEVELOPMENT time — a decision of no control included; absent on a plan whose links the planner
decided. It is written by code only, so `ScaffoldPlanAnswerSchema` leaves it out of what the model
is offered while the stored `ScaffoldPlanSchema` validates it.

**A field that crosses a version skew carries no `enum`.** Users run `viable-mcp` from a moving
`npx` range against a separately deployed platform, so `ConnectCapabilitiesSchema.executors.items`
is a bare string: a newer executor kind is an unused capability on an older platform, never a
refused session. Apply this to what a newer connector may send an older platform and nowhere else.

## One immutable protocol tree, bound in each runtime

`connectProtocols(opts)` is the connector's whole immutable HTTP tree — aliases, paths, methods,
contracts, parents. The platform and the SDK bind their own materializations of it; only the
DEPLOYMENT's parts are injected (`ConnectEntrypointOptions`): the guard alias, the ownership `gate`,
the `accountGate` and the `paid` map — `Partial<Record<ConnectPaidGate, ConnectGateRef>>`, the gate
of each kind of spend (`LocalLlm`, `Whitelabel`, `CustomDomain`, `ProductionStandalone`,
`PublishedSites`). A route declares its KIND (`paidGate(kind)` inside the factory); the deployment
names the gate service and parameters, so a connector route carries exactly its browser twin's gate.
`localLlm` is the deprecated alias of `paid[LocalLlm]`, read only when the map names none. Two roots:
`base` (`/connect` unless `path` says otherwise, the ownership gate) and `account.base`
(`<path>/account`, the account gate) — a root of its own, never a child of `base`, because
`getGates()` keeps one gate per service and the two ownership gates share one. `connect` (aliases)
and `connectRef` (typed references) name the same set, the two bases aside:

| Branch | Routes |
|---|---|
| `account` | `base` — the organization's and the person's own records, the account gate inherited; `branding.get` GET / `.save` POST `/branding` (`ConnectOrganizationBranding { organizationName, copyright }`, the save a PATCH `ConnectOrganizationBrandingSave`), `branding.backfill` POST `/branding/backfill` → `ConnectBrandingBackfill { projects }`; `llm.get` GET / `llm.set` POST `/llm` (`ConnectLlmBody` → `ConnectProfileSettingsView { llmMode, canUseLocal }`, the set the `LocalLlm` paid gate); `tokens.list` GET `/access-tokens` → `ConnectAccessTokenList` (`ConnectAccessToken` — no secret, no hash, no owner ids, `oauth`), `tokens.revoke` POST `/access-tokens/:id/revoke` (`ConnectAccessTokenParams` ≤ `CONNECT_TOKEN_ID_MAX`) → `ConnectAccessTokenRevoked` — NO create, and never under `/tokens`; `privacy.status` GET `/privacy` → `ConnectPrivacyChoices { pending, items: ConnectPrivacyChoice[] }` (`granted` = the SAVED answer), `privacy.withdraw` POST `/privacy/withdraw` (`ConnectPrivacyWithdrawBody { keys }`, 1–`CONNECT_PRIVACY_KEYS_MAX` unique keys ≤ `CONNECT_PRIVACY_KEY_MAX`, no field a grant could travel in) — NO grant or terms; `intent.pickup` POST `/intent/pickup` (`ConnectIntentPickupBody { ref }`, the guest pickup's ref shape) → `ConnectIntentPickup { prompt }`; `iam.users` GET `/iam/users` → `IamUsersResponse` — every end user of every app the organization owns, read-only; `notifications` GET `/notifications` (`ConnectFeedQuery`) → `ConnectFeedPage` — the organization's notices |
| `session` | `open` POST `/session`, `openDelegated` POST `/session/delegated`, `close` POST `/session/:sessionId/close` |
| `op` | `pull` GET `/session/:sessionId/ops` (the long poll), `submit` POST `/session/:sessionId/ops/:opId` |
| `project` | `stop` POST `/project/:id/stop` (`AgentStopArgs`) → `ConnectAgentLock`, `steer` POST `/project/:id/steer` (`AgentSteerArgs`) → `AgentSteerResult`, `batch.start` POST / `batch.get` GET `/project/:id/batch` (`StoryBatchStartArgs` → `StoryBatchView`; the get `StoryBatchView \| null`), `batch.cancel` POST `/project/:id/batch/cancel` → `StoryBatchView` — ownership only, no paid kind, never under a story path; `create` POST / `list` GET `/project`, `attach` POST `/project/attach`, `confirm`, `status`, `reinit`, `modify`, `rename` (`ConnectRenameBody { name, description? }` — the name, brief and code, never the address) under `/project/:id/…`, `branding.get` GET / `.save` POST `/project/:id/branding`, `branding.credit` POST `/project/:id/branding/credit` (`ConnectBrandingCreditBody { hideCredit }`, the `Whitelabel` paid gate), `branding.copyDefaults` POST `/project/:id/branding/copy-defaults` — all four with `?scope=` (`ConnectScopeQuery`), `kit.describe` GET / `kit.apply` POST `/project/:id/kits`, `destroy` DELETE `/project/:id` → `ConnectProjectSummary` — ownership only (the tree declares no force-unlock; `ConnectAgentLock { locked, task?, lockedAt? }` is `ConnectProjectStatus.agent` and `stop`'s answer), `llm.get` GET / `llm.set` POST `/project/:id/llm` (`ConnectProjectLlmBody { llmMode: ConnectLlm \| null }` — `null` inherits — → `ConnectProjectSettings { llmMode, effective, canUseLocal }`, the set the `LocalLlm` paid gate); `activity` GET `/project/:id/activity` (`ConnectActivityQuery` — a feed query + `detail`) → `ConnectFeedPage` |
| `config` | `get` GET / `save` POST `/project/:id/config` (`?scope=`; the save `ConnectConfigSaveBody { backend?, frontend? }` — lists of `ConnectConfigValue { name, value }`, a name matching `CONNECT_CONFIG_NAME_PATTERN` ≤ `CONNECT_CONFIG_NAME_MAX`, a value ≤ `CONNECT_CONFIG_VALUE_MAX`, ≤ `CONNECT_CONFIG_SAVE_MAX` per side), `recollect` POST `/project/:id/config/recollect` → `ConnectProjectConfig { scope, backend: ConnectConfigVariable[], frontend: ConnectFrontendVariable[] }` — ownership only |
| `story` | `status` GET `/project/:id/story/:storyId/status` |
| `files` | `list` GET `/project/:id/files`; `get` GET / `save` POST / `remove` DELETE `/project/:id/files/content` (`ConnectFileQuery { path }` ≤ `CONNECT_FILE_PATH_MAX` in the query; the save body `ConnectFileSaveBody { path, content }` — the whole file) → `ConnectFileContent { path, content }` / `ConnectFileWritten { path, buildWarning? }`; `meta` GET `/project/:id/files/meta` (`ConnectFileMetaQuery { kind: MetadataListKind, category?: SpecCategory }`, the category a nullable enum carrying `null`) → `string[]` — ownership only; `changes` GET `/project/:id/files/changes` (`ConnectFeedQuery`) → `ConnectFileChanges` (a feed page + `watching`) |
| `sandbox` | `run`, `restart`, `stop`, `rebuild` POST `/project/:id/sandbox/<verb>` → `ConnectSlotView` — the PREVIEW workload, ownership only |
| `slot` | `list` GET `/slot` → `ConnectSlotView[]` — the organization's workloads, ownership only |
| `git` | `status` GET `/project/:id/git` → `ConnectGitState { connection: ConnectGithubConnection \| null, git: ConnectGitStatus \| null }`; `log` GET `/project/:id/git/log` → `ConnectGitCommit[]`; `commit` POST `…/git/commit` (`ConnectGitCommitBody { message }` ≤ `CONNECT_GIT_MESSAGE_MAX`) → `ConnectGitCommitResult`; `discard` POST `…/git/discard` → `ConnectGitStatus`; `revert` POST `…/git/revert` (`ConnectGitRevertBody { hash }`, `CONNECT_GIT_HASH_PATTERN`) → `ConnectGitRevertResult { commit, dbWarning? }` — ownership only |
| `github` | `authorize` POST `/project/:id/github/authorize` → `ConnectGithubAuthorize { authorizeUrl }` (the address the PERSON opens — NO completion route exists); `publish` POST `…/github/publish` (`ConnectGithubPublishBody { repoName?, private?, existing?: { owner, repo } }`) → `ConnectGithubConnection`; `push` / `pull` POST → `ConnectGitSyncResult`; `disconnect` POST → `{ connection: null }`; `repos` GET `…/github/repos` (`ConnectGithubRepoQuery { page?, search? }`) → `ConnectGithubRepoList`; `branches` GET `…/github/branches` (`ConnectGithubBranchQuery { owner, repo, page? }`) → `ConnectGithubBranchList`; `link` POST `…/github/link` (`ConnectGithubLinkBody { owner, repo, branch? }`) → `ConnectGithubLinked` — ownership only; names ≤ `CONNECT_GITHUB_NAME_MAX`, branch ≤ `CONNECT_GITHUB_BRANCH_MAX`, page ≤ `CONNECT_GITHUB_PAGE_MAX`, search ≤ `CONNECT_GITHUB_SEARCH_MAX` |
| `production` | `status` GET `/project/:id/production` → `ConnectProductionStatus { workload: ConnectSlotState \| null, domain: ConnectProductionDomain \| null }`; `publish` (the `PublishedSites` paid gate — a LIMIT gate), `restart`, `stop` POST `…/production/<verb>` → `ConnectProductionStatus`; `domain.attach` POST `…/production/domain/attach` (`ConnectProductionDomainBody { domain }` — `CONNECT_DOMAIN_MIN`…`CONNECT_DOMAIN_MAX`, `CONNECT_DOMAIN_PATTERN`; the `CustomDomain` paid gate), `domain.verify` / `domain.detach` POST → `ConnectProductionDomain \| null`; `auth.get` GET `…/production/auth` → `ConnectProductionAuth { clientId, issuerUrl, secretSet, redirectUris, generatedHost, customDomain? }` and `auth.redirects` POST `…/production/auth/redirects` (`ConnectProductionRedirectsBody { redirects }` — ≤ `CONNECT_REDIRECTS_MAX` addresses of ≤ `CONNECT_REDIRECT_URI_MAX`) → `ConnectProductionRedirects { redirectUris }`, both the `ProductionStandalone` paid gate. The production workload, never the preview; NO `run` verb (a stopped site comes back by `restart`) and NO secret or reveal anywhere |
| `iam` | The generated app's sign-in, the owner console's twins under `/project/:id/iam` — ownership only, NO paid kind: `permissions` GET `…/permissions` (`ConnectScopeQuery`) → `IamPermissionsResponse`, `defaultUpdate` POST `…/permissions/default` (`IamDefinitionUpdate`); `grants.list` GET `…/grants` (`IamGrantsQuery`), `.assign` POST `…/grants`, `.revoke` POST `…/grants/revoke` (`IamAssignGrant` / `IamRevokeGrant` — one subject); `users.list` GET / `.invite` POST `…/users`, `.update` POST `…/users/:profileId`, `.remove` POST `…/users/:profileId/remove` (`IamScoped` body); `organizations.list` GET `…/organizations`, `.update` POST `…/organizations/:entitySlug`, `.members` GET / `.addMember` POST `…/:entitySlug/members`, `.updateMember` POST `…/members/:profileId`, `.removeMember` POST `…/members/:profileId/remove`; `groups.list` GET / `.ensure` POST `…/:entitySlug/groups`, `.update` POST `…/groups/:group`, `.remove` POST `…/groups/:group/remove`, `.members` GET / `.addMembers` POST `…/groups/:group/members`, `.removeMembers` POST `…/members/remove`. Params `ConnectIam{User,Organization,Member,Group}Params` (`id` = the project). Every write a POST with `scope` in its body; every read `scope` in the query; NO staff-sync twin |
| `convert` | `create` POST `/convert`, `check` GET `/convert/:id/check`, `start`, `proceed`, `purge` POST `/convert/:id/…`, `status` GET `/convert/:id` |
| `inquiry` | `answer` POST `/project/:id/inquiry/:inquiryId` |
| `pipeline` | `state` GET `/pipeline/:id/:runId`, `resume` POST `/pipeline/:id/:runId/resume` |
| `call` | `collect` GET `/call/:callId` (query `wait` ≤ `CONNECT_CALL_COLLECT_WAIT_SEC`) → `ConnectCallResult` — under `base` (guard + ownership gate), never the paid gate |

- No socket, capability view, session read, heartbeat, conversion cancel, token create, consent
  grant or terms route exists. A project has ONE inference setting — the person's preference
  (`account.llm`) and a project override (`project.llm`, `null` inherits) — read and written through
  the same shapes (`ConnectProfileSettings(View)`, `ConnectProjectSettings`, `ConnectLlmBody`,
  `ConnectProjectLlmBody(Schema)`) by the browser's API and the connector alike; both writes carry
  the `LocalLlm` paid gate. The setting is a DEFAULT (the browser's, a URL-configured host's): a stdio
  connector's own `llm` is what its session attached with. A conversion carries no mode of
  its own: like every run it follows the session that drives it, and `ViableProjectFieldsSchema`
  refuses any other inference key on a card.
- Who performs the model calls is the connector's `llm` and nothing else: `ConnectExecutor.Model`
  is advertised exactly when it is `local` (every model call is then the parent's), never in the
  cloud mode; `Human` is advertised always.
- `project.create` (`ConnectCreateBody`) and `convert.create` (`ConnectConvertCreateBody`) carry
  `sessionId?` — the caller's UNATTACHED delegated session; its pre-card checks are performed by
  that session's parent, and absent the platform performs them. A nullable id like every other
  (`{ ...idValue, nullable: true }`), and both bodies stay `additionalProperties: false`.
- A new route is added here first (alias, declaration, `connectRef` entry), then bound in every
  runtime that serves or calls it — a route declared on one side alone is an unexplained 404. Raw
  aliases stay private to declaration modules; consumers receive protocol objects.
- NO story routes: a story is a planning card, listed, created, edited, deleted and started through
  the planning tree the platform mounts beside the connector (`makePlanningProtocols`).
  `ConnectProjectStatus.project` flattens the project card into a parent agent's names (`name` =
  title, `alias` = code, the three brief bodies) plus `status` and `intrinsic`;
  `ConnectConfirmBody` carries the three brief parts including `designSystem`.
- `convert.start` and `convert.proceed` carry `confirm?: boolean` (`ConnectConvertStartBody(Schema)`
  — the start's whole body — and `ConnectConvertProceedBody(Schema)`): a PERSON agreed to what the
  step costs. The platform refuses a step that would use the plan's conversion or spend credits
  without it (`ConnectConfirmationRequired`); a `null` is "not confirmed", never a refused body.
  The proceed body also carries `update?: ConnectConvertProceedUpdate` — `name`, `description`,
  `specification`, `vision`, `designSystem`, closed, never the alias — the person's edits to what
  the analysis drafted, which the platform accepts only with the decision that starts the extraction.
- **A workload crosses the wire as a projection.** `ConnectSlotState` (`id`, `kind`, `status`,
  `slug`, `host?`, `initialized?`, `lastError?`, `buildWarning?`, `backendWarning?` — `kind` and
  `status` plain strings for the version skew) is `ConnectProjectStatus.slot`; `ConnectSlotView` adds
  `projectId?` for the sandbox answers and the workload list. Never a namespace, workload, volume or
  key: those are the deployment's infrastructure names.
- Branding routes hang under `base` (guard + ownership gate). The save body
  (`ConnectProjectBrandingSaveSchema`) is a PATCH of the text fields (`ConnectProjectBrandingFields`)
  with structural bounds only (`CONNECT_BRANDING_*_MAX`, each equal to its platform twin); value
  acceptability is the platform's rule on the MERGED record. The platform credit is READ-ONLY on
  `ConnectProjectBranding.credit` (`ConnectBrandingCredit { hidden, requested, entitled }`, optional
  for a platform that predates it) and changes only through `branding.credit`, a project route
  declaring a paid kind (`Whitelabel`), beside `session.openDelegated`, the two preference writes and
  the production routes.
- **Git crosses as self-contained mirrors** (`connect/git/types.ts`): the same fields as the
  platform's `@owlmeans/git/model` and `GithubConnection`, no git dependency here, every status a
  plain string (version skew). NO shape carries the GitHub token, and no body has a field one could
  travel in (`additionalProperties: false`).
- **Production crosses as projections** (`connect/production/types.ts`): the workload as the slot
  state, the domain with its two DNS records (`customDomain` → `cnameTarget`, `dcvName` → `dcvValue`)
  and the provider's raw states, every status a plain string. The production sign-in's client secret
  has NO field: `ConnectProductionAuth.secretSet` says whether one exists. Each paid route declares
  its kind (`PublishedSites`, `CustomDomain`, `ProductionStandalone`), so every paid kind is in use.
- **The owner console's IAM is ONE contract for both doors** (`./iam-console`, re-exported by the
  barrel): the browser's `back.iam` routes and the connector's `connect.iam` twins validate the SAME
  body schemas, so a field cannot be admitted by one and refused by the other. Every object is closed —
  an organization travels by `entitySlug`, a group by key, never a record id; a grant names exactly one
  subject (`OneSubject`); its nullable enums carry `null`. `IamRefused` stays the platform's class; the
  marker it writes (`IAM_REFUSED`) is declared here.
- **Grant modes and origins follow `@owlmeans/iam`, never a hand-written list**: `ModeProp` is
  `Object.values(IamGrantMode)`, so the revoke-only `all` and `inherit` are admitted on BOTH bodies —
  the IAM refuses them on a grant, the schema does not duplicate that rule. The bodies' docs state the
  semantics: a whole-permission revoke of a declared definition RESTRICTS the subject (it also loses
  what it inherits — default class, group, bundle); `mode: inherit` takes back only the subject's own
  value (grant or restriction), resources untouched. `IamGrantsResponse` lists what is held — origin
  `direct`, `default`, `group` (`through`) or `bundle` (a group's own listing) — plus the inherited
  grants a subject's own restriction withholds, `restricted: true`, never held.
- **The browser's sockets are cursor feeds here** (`connect/feed/types.ts`): `ConnectFeedRecord`
  (`kind: ConnectFeedKind`, `at`, `run?`, `projectId?`, `storyId?`, `slotId?`, `action?`, `agent?`,
  bounded `text?`, small `data?`) — a projection, never the record behind it; `ConnectFeedEntry` adds its
  `id`; `ConnectFeedPage { cursor, entries, gap }`. A cursor is a stream id
  (`CONNECT_FEED_CURSOR_PATTERN`, ≤ `CONNECT_FEED_CURSOR_MAX`; `CONNECT_FEED_START` = `0-0`), a page
  ≤ `CONNECT_FEED_LIMIT_MAX` (default `CONNECT_FEED_LIMIT_DEFAULT`), a hold ≤ `CONNECT_FEED_WAIT_MAX_SEC`
  (20 s). `ConnectFeedDetail` (`progress` | `thinking`) is a nullable enum carrying `null`. The three
  feed routes are GETs with no paid kind — the tree still declares NO socket.
- `ConnectScopeQuery` (`ConnectScopeQuerySchema`) names `ephemeral` (the default — the preview's set)
  or `production` (its own set, taken at a Publish) — a nullable enum carrying `null`, never `local`.
- **A backend variable's VALUE never crosses the connector.** `ConnectConfigVariable` is `{ name, set }`
  only; a frontend variable (`ConnectFrontendVariable`) adds its public `value` — it is baked into the
  bundle every visitor loads.
- **Request now, collect later.** In the delegated mode a write may wait on a model call the
  connector's own parent performs, longer than an edge holds a response. The connector names every
  non-GET request with `CONNECT_CALL_HEADER` (`x-viable-call`, a UUID it generated and reuses on a
  retry); the platform holds a named call `CONNECT_CALL_ACCEPT_MS` (20 s), then answers 202
  (`EntrypointOutcome.Accepted`) with `ConnectCallPending { pending: <id> }`; `call.collect` holds up
  to `CONNECT_CALL_COLLECT_WAIT_SEC` (25 s) per poll and answers `ConnectCallResult { state, outcome?,
  value?, error? }` — `settled` carries the value the call would have answered with (the empty schema
  `{}`, never `nullable` without a type) or `error`, the call's failure as `ResilientError.marshal`
  writes it; a pending call whose heartbeat is older than `CONNECT_CALL_LOST_MS` (90 s) is `lost`.
  The collection is transport, not domain: no `ConnectorApi` member and no generic job endpoint.
- Long work is read through its domain view — `ConnectProjectStatus`, `ConnectStoryStatus`,
  `ConversionStatusView`, `ConnectPipelineState` — each composing its record, run, pending inquiry
  and `waitingFor` reason; none exposes a generic operation id. A new long-running domain extends
  its view and endpoint, never a parallel polling vocabulary.

## The agent's controls and story batches (`src/batch/`, in the barrel)

A person can Run all (a BATCH: several planned stories implemented one after another, in an order
the platform chooses for building), Stop what the agent runs, and Steer a running open-ended change.
The browser's routes are the platform's; the connector twins are `connect.project.{stop,steer,batch.*}`
above. Every name crossing a boundary is declared here once:

- **Enums** (`consts.ts`): `StoryBatchKind` (`stories` — a person's Run all; `conversion` — a
  conversion's implementation stage), `StoryBatchStatus` (`ordering`, `running` — `STORY_BATCH_LIVE`,
  at most one per project; `completed`, `cancelled`, `halted` final), `StoryBatchOutcome` (`completed`,
  `failed`, `stopped`, `skipped`, `refused` — a story with one is never started by that batch again),
  `StoryBatchOrderSource` (`model`, `graph`, `board`), `AgentStopScope` (`run`, `story`, `batch`).
  Bounds `STORY_BATCH_MAX` (256), `AGENT_STEER_PROMPT_MAX` (16384, a free-flight prompt's),
  `STORY_BATCH_REASON_MAX` (1024); `STORY_BATCH_STALLED` (`'stalled'`) is the halt reason of a story
  nothing runs any more — every other halt reason is a refusal marker.
- **Shapes** (`types.ts`): `StoryBatchView` names stories by CARD id (`stories` in implementation
  order, `codes` id → story code for display, `outcomes` id → outcome, `current` the one last started,
  `ordering?: StoryBatchOrdering { source, reasons }` keyed by id), dates as ISO strings;
  `StoryBatchStartArgs { stories? }` (omitted or `null` = every planned story), `AgentStopArgs { scope?,
  storyId?, confirm? }`, `AgentSteerArgs { prompt }`, `AgentSteerResult { queued: true, id }`.
- **Schemas** (`schemas.ts`): the three bodies are closed with nullable optionals (`scope` a nullable
  enum carrying `null`); `stories` is unique and bounded but may be EMPTY — the platform answers that
  as the phrased `StoryBatchEmpty`, not a schema 400. `StoryBatchViewSchema` is a closed wire view
  (maps as `additionalProperties`), never a collection validator.
- **The lock view carries the controls**: `ConnectAgentLock` gains optional `stopping`,
  `stoppingStoryId`, `stopScope` and `steerable`, each set only while it applies; it is what
  `connect.project.stop` answers and `ConnectProjectStatus.agent`.
- **Refusals** (`errors.ts`, in the `viable-project:` family over `ProjectError`): `AgentNotRunning`
  (409, `viable-project:agent-not-running:<what>`), `StoryBatchActive` (409,
  `viable-project:story-batch-active:<batchId>`), `StoryBatchEmpty` (400,
  `viable-project:story-batch-empty[:<detail>]`). The markers are `AGENT_NOT_RUNNING_MARKER`,
  `STORY_BATCH_ACTIVE_MARKER`, `STORY_BATCH_EMPTY_MARKER`; readers match them by substring. The
  platform throws these classes and never redeclares them.

## The intent-first hand-off (`./intent`)

A prompt typed on the PUBLIC site (a static app that cannot import the platform repo) reaches the
platform through this subpath: the site, the API services (stash and pickup may be served by
different ones) and the manager web agree on every address, schema and step. Platform side:
`/intent-first`.

- **Two guest routes and three screens, no guard, no gate, no service.** `stash` POST
  `/public/intent` (`{ prompt 1..INTENT_PROMPT_MAX (8192), consent: const true }` →
  `{ ref, expiresAt }`), `pickup` POST `/public/intent/pickup` (`{ ref }`, exactly
  `INTENT_REF_LENGTH` (24) Base58 → `{ prompt }`), `landing` (`frontend()` at `/start`, `sticky`) and
  `importLanding` (`frontend()` at `INTENT_IMPORT_PATH` = `/start/import`, `sticky`) and `proLanding`
  (`frontend()` at `INTENT_PRO_PATH` = `/start/pro`, `sticky`).
  Mount the tree OUTSIDE any guarded parent (a route inherits every ancestor's guard) and fill
  `service` yourself (the site binds `landing` with `{ routeOptions: { overrides: { service } } }`,
  which also makes its `url()` absolute).
- **The prompt never travels in a URL or a flow token.** The server keeps it `INTENT_TTL_SECONDS`
  (120) under the unguessable `ref` and collects it with one `GETDEL`; only `?ref=`
  crosses (the flow payload is unescaped CSV and the token unsigned).
- **`intentFlow` is walked on both sides and never becomes the live flow model.** `compose`
  (initial, the site) →`handoff`→ `land` (initial, the landing) →`review`→ `review` (`HOME`), plus
  the EXPLICIT `land` →`sign-in`→ `sign-in` (`DISPATCHER`) →`next`→ `review`. A signed-out visitor
  is parked with `flowLandingOf(context).suspendFlow` at `sign-in`. The parameter is `?ref=` — never `?flow=` (`web-flow`
  parses it on every page load) and never `?intent=` (the login surrogate window owns it).
- **CORS is not declared here**: the routes ride the global `origin: '*'` (no credentials);
  `makeIntentProtocols` carries a `TODO(cors)` naming the origins to keep if that is restricted.
- **The second intent — import an existing project — is a plain link, no stash.** The visitor
  brings no text, so the site links straight to `importLanding` (its absolute URL is
  `new URL(INTENT_IMPORT_PATH, <platform web>)`); nothing crosses but the consent linker's `owlcc`.
  `intentFlow` is not walked for it: its `land` step is `/start`, and the import landing needs only
  the way on after sign-in, which is `HOME` for both.
- **The third intent — subscribe to Pro — is a plain link too.** The site's pricing Pro button
  links to `new URL(INTENT_PRO_PATH, <platform web>)`; nothing crosses but `owlcc`, nothing is
  stored in the browser: the platform's landing parks its own billing deep link through sign-in.
- **The browser draft is IndexedDB, per origin — ONE record slot for both intents.** `IntentDraft`
  (`id`, `ref`, `prompt`, `expiresAt`) is kept between pickup and decision (`INTENT_DRAFT_TTL_MS`,
  24 h); `IntentImportDraft` (`id`, `kind: INTENT_IMPORT_KIND`, `expiresAt`) holds the import wish
  for `INTENT_SUSPEND_TTL_MS` (30 min — the sign-in it rides through). The newest intent replaces the
  other; a record is an import iff its `kind` says so (a prompt draft carries none). Expiry is
  checked on read.

## Slot metadata keys: optional means omitted

`SlotMetadata` is what the platform signs and pushes into a slot; the publisher refuses the WHOLE
configuration with a 401 when the body carries a key its schema does not know. A key added after
slots exist is therefore OPTIONAL in the type and OMITTED from a push while unset:
`brandingGoogleTag` (in `metadataConfigs`), `cspSources` (in `SlotListMetadata`), `iamTenancy`
(the tenancy flags that are on, `users,operators` — the target backend's `IAM_TENANCY`). The build
ENVIRONMENT differs: `brandingEnv` always emits every `BRANDING_ENV_KEYS` entry,
`BRANDING_GOOGLE_TAG` as `''` when unset (the build reads `''` as "none"). `BRANDING_PRODUCT` is
always `''`: `projectName` is the project's ALIAS (a slug), never a product name; the human-readable
one is the target's own `APP_TITLE` (from the card's `title`), which the build falls back to
(`tests/branding.spec.ts`).

`metadataConfigs` / `metadataLists` / `metadataSecrets` enumerate what is STORED (one
`project-config` / `project-secret` row per key). `metadataSecrets` holds the workload credentials
the platform mints: `oidcClientSecret`, `dbAppPassword`, `valkeyPassword` and `appSecret` — the
workload's own secret, minted once per scope and never rotated, which the target reads as
`APP_SECRET_ENV` (`APP_SECRET`, set after the owner's variables; at-rest encryption keys derive
from it). None of them is ever an owner variable's name. `cspSources` and `iamTenancy` are not owner
settings, so they are on the type only (`iamTenancy` is computed from the project card at every push); the Google tag's CSP hosts never travel in it — the publisher derives them from
`brandingGoogleTag`. Push rules: `/slot-config`.

## Blueprint types, cases, skill and persona names

`src/blueprint/` holds only types and constants. A `Blueprint` has five REQUIRED build layers
(`technology`, `stack`, `template`, `createApp`, `packages`) and one OPTIONAL `experience` layer —
what the product does for its users, changing no dependency and no coder prompt. Read `experience`
only through a total helper: `landingGatePreferenceOf` (`LandingGatePreference.Allow` for no layer,
no key or an unknown value) and `tenancyHelper.tenancyOf`; `experience.coverage?: ProjectArea[]` (the
signed-in areas an initialization covers) is read through `@owlmeans/viable`'s
`blueprintHelper.coverageAreasOf`. An execution carries a `BlueprintRef` — `id`,
optional `case`, optional `tenancy`, an override patch — never a resolved blueprint.

`BlueprintCase` (`web`, `scalable`, `ai-pipeline`, `ai-agent`, `game`, `work-management`,
`work-management-tenanted`, `bot`, `ai-bot`) and `GameKind` are what `fields.blueprintCase` /
`fields.gameKind` carry. `work-management-tenanted` is never classified directly: code picks it from
`work-management` when the project's tenancy decision has a flag on. `WorkKind` (`project`, `crm`,
`service-desk`, `inventory`, `recruiting`, `field-service`, `process`) is `fields.workKind` — which
ready-made card types and flows a work-management product starts from, changing no dependency —
and `fields.caseQuote` (≤ `CASE_QUOTE_MAX`) is the requester's sentence that case was verified
against. A bot case (`bot`, `ai-bot`) records `fields.botPlatforms` — `BotPlatform[]` from
`@owlmeans/bot` (re-exported here), at least one, unique, closed set — and `fields.botKit`
(`BotKit`: `moderation`, `support`, `intake` — what the bot is for), both nullable like `workKind`.
`BotKitAction` (`delete`, `warn`, `mute`, `ban`, `reply`, `record`, `agent`) is the kit's product
vocabulary — `warn` a reply to the sender, `record` the product's request record, `agent` the
product's agent — declared here, never in `@owlmeans/bot`. Keyword groups are the product's OWN
records (a type the pipeline designs and generates), never a stock bot record.
`BlueprintCapabilities.bot?` turns the stock bot packages on (connections, hook, receivers, activity);
it is optional and absent reads as off. A story's `runtime.bot?.handlers` (`StoryDesignBotHandler {
name, purpose, trigger: 'keywords' | 'all' | 'command' | 'addressed', command?, actions:
BotKitAction[], agent?, records? }`) is read only through `storyRuntimeHelper.botHandlersOf(runtime)`,
total (`[]` without the block); `needsRuntime` stays about the queue, the worker and agents. A
`keywords` handler matches the message against the product's own keyword-group records, the type
named in `records` (which also names the records an `intake` handler writes). `StoryDesignSchema` declares the block, so a design that
carries one is not refused. `TemplateLayer.seeds` names case seed directories under the overlay's `.cases/`, copied
over the staged tree in order (names, never paths; a variant lists its base seed first). What a case MEANS (`BLUEPRINT_CASES`,
`applyBlueprintCase`, `applyBlueprintPatch` / `freezeBlueprint`, `joinPersonaSkills`, the
classification schema) lives in `@owlmeans/viable` (`/blueprints`, `/blueprint-cases`); that table
is `Record<BlueprintCase, …>`, so a new member fails to compile there until it has a row.

`src/skills/` holds two enums: `ViableSkill` (prompt-skill aliases) and `ViablePersona`, named by
a `Blueprint`'s `stack.skills` / `packages.skills` / `personaSkills`. The catalogue (`VIABLE_SKILLS`,
`SKILL_ORDER`, `FRAMEWORK_OWNED_SKILLS` / `skillsForBlueprint`, `VIABLE_PERSONAS`) lives in
`@owlmeans/viable` (`/personas-and-skills`). A new member is half a change: `SKILL_ORDER` and
`VIABLE_PERSONAS` fail to compile without it, but `VIABLE_SKILLS` is a list and the prompt service
skips an unresolved alias — a missing body is a rule no model receives.

## Closed sets that mean something

- **`ProjectArea`** — guest `/`, user `/frontoffice`, admin `/admin`, operator `/backoffice`. A
  product's own roles map onto `user` or `operator`; there is no fifth area. `AREA_PATHS`,
  `AREA_ACCESS` and `AREA_TIER` are total over it (`/target-areas`).
- **`PermissionDefault`** — `none` / `user` / `member` / `owner`, the default class of a generated
  permission (the IAM's `IamDefaultClass` values, `/iam`): evaluated when claims are issued, never
  copied onto rows; `member` / `owner` are the organization being acted in, so they apply only to
  an organization-bound permission.
- **`AccessBlock`** — a model writes `permissions` (`<resource>--<action>`, optionally
  `@<routeParam>`), `level` and `defaultEnabledPermissions?` (the subset safe for every signed-in
  user). CODE writes `defaults` (`PermissionDefault` per permission name, keyed with the `@` selector
  stripped) and `entityScoped` from the tenancy and the area, and empties
  `defaultEnabledPermissions` in a tenanted area. `AccessBlockSchema` declares only the model keys
  and is pinned byte for byte (`tests/access-schema.spec.ts`); widening it changes every access
  prompt. Per-record kinds and their three names (`<kind>--view` / `--modify` / `--create`) are
  declared by the library's access policy (`/target-tenancy`).
- **`TargetLayout` + `TARGET_LAYOUTS`** — the integrity manifest is PER LAYOUT. A volume never
  migrates, so a legacy-layout (v1) project stays on its tree and must verify **clean**;
  `TARGET_INTEGRITY_FILES` is the union over layouts, so a caller has both probes before it knows
  its tree, and an absent layout reads as the CURRENT one (`/workload-integrity`).
- **`SubProject`** — a ROLE vocabulary mapped per layout (`ROLE_DIRS`), never joined onto a path.
  Both generations arrive on the wire, so the enum stays total over what any live agent sends, and
  no role but `Common` resolves to the `common` directory.
- **`ConversionStage`** — advanced only through `conversionStageHelper.stageAfter` / `.canEnter` / `.decisionFor`; a
  transition computed at a call site re-enters a stage already paid for.
- **`ModerationCategory`** — a wire contract with eight languages of wording behind it; a fifth
  shape is PHRASED into one of the four, never added.

## The conversion vocabulary is shared by three executors

The census, listing and relocation commands have three implementations — the SDK's local executor,
the publisher's file helper, the library's in-process helper — so whatever they could disagree
about is a constant HERE: `CENSUS_SKIP_DIRS` (`node_modules`, `.git` — never `dist`/`build`/`.next`,
which an origin may keep sources in), `SOURCE_LIST_EXCLUSIONS` (the metadata directories plus
`CONVERTED_ORIGIN_DIR`), `BINARY_PROBE_BYTES`, `CENSUS_MAX_HEAD_BYTES`, `RELOCATE_ALWAYS_KEEP`. The
one allowed difference is stated: the platform's two keep what a volume it owns must not lose, the
SDK's keeps what a DEVELOPER owns (`.viable`, the two `.env` files).

`PlatformFlow` is CLOSED — account lifecycle only (sign-up, sign-in, sign-out, verify-email,
recover-account). It is the one way a census flow may leave a conversion's story list, so a member
that names user management (inviting, roles, blocking) would let an origin's admin area be dropped.

`docs/conversion/` is addressed only through the path builders (`CONVERSION_*_FILE`,
`conversionDocHelper.conversionStoryDoc`, `.conversionSeedDoc`, `.conversionSummaryDoc`) — the purge reads them back, and a path spelled at a
call site is a file the purge leaves behind.

**`FileSummary` is one origin file read WHOLE**: `path` (origin-relative), `hash` (sha256 of the
content — the per-file resume guard), `chars`, `lines`, `role`, `summary`, `exports`,
`declarations`, `routes[{method, path, handler, guards, line}]`,
`schemas[{name, line, fields[{name, type, required, enum?, default?, ref?}]}]`,
`ui[{component, line, routeParams, inputs}]`, `imports` (an origin path where the import resolves,
the specifier otherwise), `tenancySignals[{signal, line}]`, and `failed` when no model summary could
be written. Every `line` is 1-based in the whole file. They are stored one document per top-level
package under `CONVERSION_SUMMARY_DIR`; the `CONVERSION_SUMMARY_ROOT` document's `packages` names
the whole set (`SummaryDocMeta`: `package`, `packages`, `planned`, `skipped`, `entries`). Behaviour
— windows, packing, the guards, the purge — is the converter's (`/converter`).

**`OriginTypeSpec` is one type of the origin**, assembled by the converter with no model
from the summaries' schemas: `name` (PascalCase), `entity` (kebab key), `label`, `attributes[{name,
type, required, default?, closed?, list?, ref?}]` (`type` a scalar — `string`, `number`, `boolean`,
`date`, `object` — or another origin type's name; `ref` the type whose id it holds), `relations[{to,
key, cardinality}]`, `definition?` (`OriginDefinition`: card-type, flow, status, transition, field —
what a work-management target keeps as planning definitions), `representation?`
(`OriginTypeRepresentation`: `record` stored on its own, `value` kept inside another, `view` only
answered — by the summaries' evidence; a converted catalogue never stores a value or a view; absent
in a document assembled before it, read back only when it is one of the three) and `proofs`. `OriginDefinitionFacts`
is what a converted target's definition editors must offer — field kinds with their
`OriginFieldSchema`, icon/tone, the `app` properties, status categories with their
`IntrinsicStatus`, initial and moves, the container (`projectFlows`) and the record of work (base
fields, `linked`, `numbered`). Both live in `docs/conversion/types.md`: the frontmatter carries the
types WITHOUT proofs, `definitions`, and the proofs in its `origin` list (each with its `type` —
what a purge drops); `originTypesHelper.recordOf(data)` is the ONE reading of it, checked field by
field (a malformed type dropped alone, malformed definitions read as none), for the converter's
store and the story checks alike. The mapping itself is `@owlmeans/viable`'s (`planningOriginHelper`).

## The inquiry vocabulary is a deliberate COPY; the ceiling is not

`ConnectInquiryKind` / `InquiryPayload` / `InquiryAnswerPayload` mirror `@owlmeans/llm-common`'s
`Inquiry` family under other names, so both import into one file and the API services stay free of
the model runtime. Values are byte-identical (the platform's mapper is a widening; a test pins it),
as `ModelTask` is with `DelegatedTask`.

The CEILING exists once: `CONNECT_INQUIRY_MAX_TEXT` equals `DEFAULT_INQUIRY_ANSWER_CHARS`, and
`./convert`'s `INQUIRY_STATE_TEXT_CHARS` (what a pipeline STATE keeps of an answer; the rest goes
to `docs/conversion/inquiries.md`) equals its namesake there. Two ceilings for one value truncate
silently at the smaller; never introduce a local cap.

## Errors: declared here, phrased where they are read

`ConnectError` and its family (`ConnectSessionNotFound`, `ConnectSessionGone`, `ConnectOpTimeout`,
`ConnectOpRefused`, `LocalSlotUnsupported`, `ConnectOpUnknown`, `ConnectCallLost` (`call-lost:<callId>`
— a collected call's outcome was never recorded), `ConnectOutOfCredits`,
`ConnectConsentRequired`, `ConnectConfirmationRequired`) are `ResilientError` classes with
`viable-connect:` markers. The three refusals a connector phrases for a person pack their fields
into the message (only `type` and `message` survive a marshal), are built with `static encode(...)`
and rebuilt in `finalizeUnmarshal()`:

- `ConnectOutOfCredits` — `out-of-credits:<gate>:<requiredUsd>:<balanceUsd>:<encodeURIComponent(topUpUrl)>`;
- `ConnectConsentRequired` — `consent-required:<gate>:<deadline epoch ms | 0>:<encodeURIComponent(consentUrl)>`
  (`0` = unknown; epoch ms and the URL last because ISO dates and URLs contain colons). It is the
  connector's face of the EU spend consent (`PerformanceConsentRequired` on the web, `/payment`):
  only a PERSON gives it, in the browser at `consentUrl`;
- `ConnectConfirmationRequired` — `confirmation-required:<action>:<cap>:<spent>:<estimate>:<fromAllowance>:<fromCreditLimits>:<moneyUsd>`,
  `encode(fields: ConnectConfirmation)` and its inverse `decode(packed)` (an unreadable number reads
  back as `0`, never `NaN`). A conversion verb (`action`: `convert-start` / `convert-proceed`) would
  use the plan's conversion or spend credits: `cap` and `spent` are the conversion limit and what the
  conversion used of it (`0` with no plan unit), `estimate` the stage's, split into `fromAllowance`
  and `fromCreditLimits` (credits) and `moneyUsd` (topped-up credits, the only money figure). A person
  agrees in the CONVERSATION and the caller repeats the call with `confirm: true`.

`ConnectSessionGone` is registered FATAL on the agent side: the step fails as an OUTCOME, so the
run row records where it stopped and `pipeline.resume` picks it up when a connector returns.

The project and story refusals — `ProjectNotFound`, `ProjectPermissionError`,
`ProjectStoryNotFound`, `ProjectStoryMissconfigured`, `ProjectAgentOccupied` and their bases
(`ProjectResourceError`, `ProjectStoryError`, `ProjectError`, `ProjectAgentError`) — are declared
here because the viable planning plugin throws them from a process-neutral package. Type names and
`viable-project:` markers are wire contracts. The platform re-exports the family and never
redeclares a base: unmarshalling is by type name with the last registration winning, so a second
declaration breaks `instanceof`.

Every refusal declares its HTTP status on its leaf class (`/error`); `tests/error-status.spec.ts`
refuses an exported class whose status was not decided:

| Status | Classes |
|---|---|
| 402 | `ConnectOutOfCredits` |
| 428 | `ConnectConsentRequired`, `ConnectConfirmationRequired` |
| 400 | `StoryBatchEmpty` (the selection holds no planned story) |
| 404 | `ProjectNotFound`, `ProjectStoryNotFound`, `ConnectSessionNotFound`, `ConnectOpUnknown` |
| 409 | `ProjectAgentOccupied`, `ProjectStoryMissconfigured`, `ConnectSessionGone` (no connector attached), `LocalSlotUnsupported`, `AgentNotRunning`, `StoryBatchActive` |
| 410 | `ConnectCallLost` (the outcome is gone, not late) |
| 422 | `ConnectOpRefused` |
| none (500) | the bases, `ConnectOpTimeout` (a peer's fault), `ProjectPermissionError` (never thrown; a permission refusal extends `AuthForbidden`) |

The platform's other refusals (conversion, moderation, reserved names, integrity) are declared in
the product repo, so a consumer matches them by MARKER: `@owlmeans/viable-sdk`'s `REFUSALS` map and
the manager's `useErrorPhrase` read the same substrings. A marker change changes both readers.

## Tests

`bun test ./tests` — offline.

| File | Pins |
|---|---|
| `planning.spec.ts` | the two flows and transition tables, type declarations, slots (the `requirements` slot on both cards), code policies, reserved types outside `cardTypes`, field schemas (null optionals, refused strays and closed-set values, no `converterLlmMode`), landing fields and sentence, the tenancy decision, the work kind and bounded case quote, the bot platforms and kit, card helpers, the `follows` anchor, refusal type names after a marshal |
| `tenancy.spec.ts` | `NO_TENANCY` frozen, `tenancyHelper.tenancyOf` defaults and the literal-`true` rule, `.tenantedArea` |
| `access-schema.spec.ts` | the model-facing access schema: model keys only, byte-identical |
| `scaffold.spec.ts` | old- and new-shape plans passing the schema and slot, `null` optionals, no `minItems`, closed anchors/slots, the landing helpers |
| `blueprint.spec.ts` · `branding.spec.ts` | `landingGatePreferenceOf` defaults, the bot cases, kits, kit actions and re-exported platforms · the build env and metadata vocabulary |
| `connect-entrypoints.spec.ts` · `connect-convert.spec.ts` | every route's method and path, aliases = `connectRef`, the paid kinds on the delegated session, the two preference writes and the credit switch alone, the account inference/token/privacy/intent routes and their closed bodies, the configuration routes and their closed bodies, the git and GitHub routes under the base with no paid gate and no completion route and their closed bodies, the production routes under the base each with its own paid kind, no secret or run verb, and their closed bodies, the IAM routes' count and addresses, the scope query, the account branding routes, no socket or story route, the create body's `sessionId`, branding body, the kit routes and their closed shapes, the collect route under the base and its timing constants, the pending/params/query/result shapes, the three feed routes (owned base / account base, GET, no paid gate, no socket) and the feed query shapes · conversion routes, the create body's `sessionId`, the start's body and both verbs' `confirm`, an unknown executor kind accepted |
| `iam-console.spec.ts` | the owner-console schemas (one subject, closed bodies, `null` in nullable enums, `mode: inherit` on a revoke and — deliberately — on a grant body, the `inherit`/`bundle` values), the 22 `connect.iam` routes under the base with no paid gate, the customer-wide listing under the account base, POST writes with `scope` in the body and reads with it in the query, the connector's IAM params |
| `convert.spec.ts` | the three structural walks over the barrel, nullable enums under Ajv, census classifiers, stage transitions, every document path (summaries included) under `CONVERSION_DIR` |
| `design.spec.ts` | the design aggregate, staleness ranking (the requirements hash included), schema refusals, a runtime's bot handlers (schema — `keywords`, never `rules` — and `botHandlersOf`), `storyDesignHelper.userStoryOfDesign` |
| `requirements.spec.ts` | id order, the card's exact shape and scope stripping, sections 5–9 and retained markers, slices and frontmatter, `docs/requirements.md`, digest stability, requested-story placement / dedupe / cap, the document schema |
| `error-status.spec.ts` · `connect-errors.spec.ts` | declared statuses through a marshal · packed refusal fields fresh and after a round trip, the confirmation's `decode` |
| `intent.spec.ts` | the four declarations without guards, schema cases incl. crafted refs, the flow walk and `flowLandingOf(context).suspendFlow` payload, error statuses |
| `presentation.spec.ts` | the agent-output classifier (`/agent-presentation`) |
| `batch.spec.ts` | the batch and stop vocabularies, every batch schema compiling and in the barrel, the closed view, the three refusals' markers, class and status through a marshal (the stop/steer/batch routes and bodies are in `connect-entrypoints.spec.ts`) |

## Depends On

- `@owlmeans/planning` — the workcard contracts the planning module declares over
- `@owlmeans/resource` — the `ResourceError` base of the project refusals
- `@owlmeans/entrypoint`, `@owlmeans/route` — the entrypoint declarations
- `@owlmeans/bot` — `BotPlatform` (re-exported), named by the bot case's card fields (browser-safe,
  runtime-free); the kit actions are this package's own `BotKitAction`
- `@owlmeans/error` — the `Connect*` error family
- `@owlmeans/iam` — the owner console's IAM vocabulary `./iam-console` re-exports (public, runtime-light:
  `auth`, `context`, `entrypoint`, `error`, `oidc`, `route`); `@owlmeans/auth-common` — `ENTITY_SLUG_PATTERN`
- `@owlmeans/llm-common` — `ExecutionEffort`/`ExecutionLevel`, `LlmPurpose`, the spectator
  contracts, and the inquiry ceilings this package's copies are pinned to
- `@owlmeans/agent-common` — the run and pipeline contracts (re-exported `AgentRunStatus`)
- `@owlmeans/flow`, `@owlmeans/auth`, `@owlmeans/context` — `./intent` only: `ShallowFlow`, the
  `DISPATCHER` and `HOME` aliases its flow steps address

## Related

- [[viable-sdk]] · `@owlmeans/viable-mcp` (closed-source) — the connector SDK written against these contracts, and its npx
  stdio server
- [[flow]] · [[client-flow]] — the model `intentFlow` is walked with, and `flowLandingOf(context).suspendFlow`
- [[inquiry]] · [[llm-common]] — the primitive `InquiryPayload` mirrors; the model runtime's contracts
- [[planning]] — the workcard model the planning module builds on
- DOMAIN meaning lives downstream (`target-areas`, `target-tenancy`, `scaffolding`,
  `workload-integrity`, `viable-metadata`, `converter`); this skill owns the CONTRACT — how a name
  is declared and what refuses it.

## Installed blueprint discovery contract

`BlueprintCatalogue` is the public JSON DTO for a registry read: version 1, defaultBlueprintId and
blueprints. Each blueprint carries stack descriptors and complete resolved cases; each case carries
capabilities, tenancy, supported application categories, an optional `categoryKind` (`work`,
`game` or `bot` — which kind of category list it is), optional planningResources and, for a bot
case, optional `botPlatforms` (the supported `BotPlatform` values). Category
ids, aliases and record names are data, not permission scopes. The signed agent registry produces
the catalogue; Common declares no private viable-agent runtime dependency.

`connectProtocols` declares account.blueprints at authenticated GET `/connect/account/blueprints`.
It uses the account gate as a separate root, without a project ownership parameter or payment gate.
`connectRef.account.blueprints` is the matching SDK reference. This model-free read works before
project creation. Both MCP transports reuse the SDK's `describe_blueprints` tool.
