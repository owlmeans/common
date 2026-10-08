# @owlmeans/viable-common

Runtime-free contracts of the OwlMeans Viable platform.

Viable turns a description into a running full-stack application. Four runtimes have to agree
about every name involved — the platform API services, the agent, the publisher that runs inside a project
slot, and the connector SDK on a developer's machine — so each of those names is declared here
once and imported by all of them. There is no runtime in this package: no `@langchain/*`, no
filesystem, no inference SDK. It is safe to import from a browser bundle, so it holds names and
shapes only: data that only the agent library reads (skill bodies, persona prompts, the blueprint
case table, BA model-answer schemas) belongs in `@owlmeans/viable`, not here. An application outside
the Viable platform has no use for it. The package's skills are `viable-common` and
`agent-presentation`.

## Installation

```bash
bun add @owlmeans/viable-common@^0.0.47
```

## What is in it

| Subpath | Contents |
|---|---|
| `.` | The shapes a generated project is described by: the planning module (Viable card types and flows), user stories and entities, the design and scaffold plans, UX/UI specs, the `docs/` metadata paths, the four user areas and the tenancy decision, model roles and personas, blueprint types, moderation categories, slot metadata, the agent-output presentation taxonomy. Re-exports every subpath except `./intent` |
| `@owlmeans/viable-common/slot` | The slot command vocabulary — file, shell, git and database commands, the sub-project roles and layouts, the target's ports and process markers |
| `@owlmeans/viable-common/connect` | The connector protocol: sessions, operations, model tasks, questions, domain statuses, capabilities, the error family, and `connectProtocols()` — the one declaration both the platform and the SDK bind |
| `@owlmeans/viable-common/convert` | Converting an application that already exists: the stages and their transitions, the origin and stack taxonomy, the census classifiers, and the `docs/conversion/` layout |
| `@owlmeans/viable-common/integrity` | The target-shape manifest — what a slot is allowed to install, build and run — per target layout |
| `@owlmeans/viable-common/intent` | The intent-first hand-off from the public site: `makeIntentProtocols`, `intentFlow`, the stash/pickup schemas, `IntentDraft`, `IntentExpired` / `IntentThrottled` |
| `@owlmeans/viable-common/iam-console` | The owner console's IAM contract shared by the browser and the connector: route params, closed bodies, answers, every `Iam*Schema`, `IAM_REFUSED` |
| `@owlmeans/viable-common/legal` | `OWLMEANS_LEGAL_DATES`, active `LegalDocumentDates`, `PendingLegalDocumentDates`, `LegalDocumentDateMetadata` and `LegalDocumentKey` — shared active ISO dates and explicit pending metadata; no runtime dependencies |

## Concepts

- **Viable card** — a project, user story or specification is an `@owlmeans/planning` workcard of a
  `VIABLE_*_TYPE`; what is Viable's lives under the card's `fields`, validated by
  `ViableProjectFieldsSchema` / `ViableStoryFieldsSchema`.
- **Story code** — `US-` + five uppercase characters; the vocabulary of a target's files. A card id
  never reaches a target file.
- **Area** — `ProjectArea`: guest `/`, user `/frontoffice`, admin `/admin`, operator `/backoffice`.
  There is no fifth area.
- **Tenancy** — `ProjectTenancy` (`operators`, `users`), recorded on the project card and read only
  through `tenancyHelper`.
- **Connector protocol** — the immutable HTTP tree `connectProtocols(opts)` declares; each runtime
  binds its own materialization and injects only deployment parts (guard, gates, paid gates).
- **Target layout** — `TargetLayout`; the integrity manifest is per layout, and a legacy layout must
  still verify clean.
- **Agent-output presentation** — `agentPresentationHelper.classifyAgentMessage` sorts a model message
  into code, diff, structured, Markdown or plain, with a specialist role.

## Usage

### Bind the connector protocol tree

The tree is the same everywhere; the deployment supplies its guard and gates.

```typescript
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { ConnectPaidGate, connectProtocols } from '@owlmeans/viable-common/connect'

const tree = connectProtocols({
  guard: DEFAULT_GUARD,
  gate: { alias: 'project-owner', params: ['id'] },
  accountGate: { alias: 'account-owner', params: [] },
  paid: { [ConnectPaidGate.LocalLlm]: { alias: 'paid-llm', params: ['cap'] } },
})

tree.project.status   // a protocol object — bind it in the server, call it from the SDK
tree.account.base     // `/connect/account`, a root of its own beside `tree.base`
```

### Read the cards and the tenancy decision

```typescript
import { ProjectArea, tenancyHelper, viableCardHelper } from '@owlmeans/viable-common'

if (viableCardHelper.isViableStory(card)) {
  const { area, primary } = viableCardHelper.storyFieldsOf(card) // absent area reads as guest
  const story = viableCardHelper.userStoryOf(card, design)
}

const tenancy = tenancyHelper.tenancyOf(blueprint)              // NO_TENANCY unless a literal `true`
tenancyHelper.tenantedArea(ProjectArea.User, tenancy)           // follows `users`
viableCardHelper.isUserChannel(scope.channel)                   // `web` / `connect` only
```

### Verify a target tree

The verifier does no IO: read every path in `TARGET_INTEGRITY_FILES` (`null` for an unreadable
one) and hand the map over.

```typescript
import { TARGET_INTEGRITY_FILES, targetIntegrityHelper } from '@owlmeans/viable-common/integrity'

const files = Object.fromEntries(await Promise.all(
  TARGET_INTEGRITY_FILES.map(async path => [path, await readOrNull(path)] as const)
))
const report = targetIntegrityHelper.verifyTargetShape(files)
if (!report.ok) {
  throw new Error(targetIntegrityHelper.formatIntegrityReport(report))
}
```

### Classify agent output

```typescript
import { AgentMessageCategory, agentPresentationHelper } from '@owlmeans/viable-common'

const input = { agent: 'coder', action: 'plan-scaffold', outputType: 'tool_calls', value: toolCall }
if (!agentPresentationHelper.isAgentMessageHidden(input)) {
  const presentation = agentPresentationHelper.classifyAgentMessage(input)
  if (presentation.category === AgentMessageCategory.Structured) {
    renderCard(presentation.structure, presentation.role)
  }
}
```

### Legal dates

```typescript
import { OWLMEANS_LEGAL_DATES } from '@owlmeans/viable-common/legal'

const terms = OWLMEANS_LEGAL_DATES.terms                         // { effective, updated } ISO dates
const dpa = OWLMEANS_LEGAL_DATES['data-processing-agreement']    // { status: 'pending', effective: null, … }
```

## API

The full export list is the package's `src/` barrel; the groups an app reaches for:

| Area | Exports |
|---|---|
| Planning | `VIABLE_PROJECT_TYPE`, `VIABLE_STORY_TYPE`, `VIABLE_SPEC_TYPE`, `VIABLE_TYPE_SCHEMAS`, `VIABLE_FLOW_SCHEMAS`, `ViableStoryStatus`, `ViableProjectStatus`, `ViableChannel`, `ViableProjectCard`, `ViableStoryCard`, `viableCardHelper`, `viableSpecHelper`, `landingSentenceHelper` |
| Project refusals | `ProjectNotFound`, `ProjectPermissionError`, `ProjectStoryNotFound`, `ProjectStoryMissconfigured`, `ProjectAgentOccupied` and their bases |
| Areas and tenancy | `ProjectArea`, `AREA_PATHS`, `AREA_ACCESS`, `AREA_TIER`, `ADMIN_PERMISSION`, `OPERATOR_PERMISSION`, `ProjectTenancy`, `ViableTenancyDecision`, `NO_TENANCY`, `tenancyHelper`, `TENANCY_QUOTE_MAX` |
| Blueprint and skills | `Blueprint`, `BlueprintRef`, `BlueprintCase`, `GameKind`, `WorkKind`, `landingGatePreferenceOf`, `ViableSkill`, `ViablePersona` |
| Design and scaffold | `StoryDesign`, `ScaffoldPlan`, `ScaffoldPlanSchema`, `landingPlanHelper`, `StoryDesignPort`, `AccessBlock`, `PermissionDefault` |
| Slot metadata | `SlotMetadata`, `metadataConfigs`, `metadataLists`, `metadataSecrets`, `BRANDING_ENV_KEYS`, `brandingEnv` |
| Agent output | `agentPresentationHelper`, `AgentMessageCategory`, `AgentStructuredKind`, `AgentCodeLanguage`, `AgentMarkdownKind`, `AgentMessageRole` |
| `./slot` | `SlotCommandType`, `slotCommandHelper`, `SubProject`, `LAYOUTS`, `ROLE_DIRS`, `slotLayoutHelper`, `slotOriginHelper`, `DATABASE_READ_LIMITS` |
| `./connect` | `connectProtocols`, `connect`, `connectRef`, `ConnectEntrypointOptions`, `ConnectPaidGate`, `ModelTier`, `modelTierHelper`, the view and body types with their `*Schema`s, `CONNECT_CALL_*`, the `Connect*` error family |
| `./convert` | `ConversionStage`, `conversionStageHelper`, `OriginKind`, `StackId`, `censusHelper`, `conversionDocHelper`, `CENSUS_SKIP_DIRS`, `SOURCE_LIST_EXCLUSIONS` |
| `./integrity` | `TargetLayout`, `TARGET_LAYOUTS`, `targetLayoutHelper`, `targetIntegrityHelper`, `TARGET_INTEGRITY_FILES`, `TARGET_PROTECTED_FILES` |
| `./intent` | `intent`, `makeIntentProtocols`, `intentFlow`, `IntentStashBodySchema`, `IntentPickupBodySchema`, `IntentDraft`, `IntentExpired`, `IntentThrottled` |

### Error statuses

| Status | Classes |
|---|---|
| 402 | `ConnectOutOfCredits` |
| 428 | `ConnectConsentRequired`, `ConnectConfirmationRequired` |
| 404 | `ProjectNotFound`, `ProjectStoryNotFound`, `ConnectSessionNotFound`, `ConnectOpUnknown` |
| 409 | `ProjectAgentOccupied`, `ProjectStoryMissconfigured`, `ConnectSessionGone`, `LocalSlotUnsupported` |
| 410 | `ConnectCallLost` |
| 422 | `ConnectOpRefused` |

## Rules worth knowing before you change something

**A schema is written for the reader that will refuse it.** Model-answer schemas are annotated
`JSONSchemaType<T>` so a drift from the type is caught where it is written; record schemas are
hand-written and cast, because they are re-applied as a Mongo `$jsonSchema`, which admits no
`Record<>` maps, no `integer` and no date objects.

**`nullable: true` always carries its `type`, and a nullable `enum` lists `null` among its
values.** Ajv checks `nullable` and `enum` independently, so the pair written apart admits `null`
by type and then refuses it by enum — the field can only ever be omitted, never sent empty. A
provider's structured output writes an unset optional as `null`, and a wire body where `null`
means "inherit" has no other spelling. `tests/convert.spec.ts` walks every exported schema for
both faults, and for draft-04 tuple `items`.

**A field that crosses a version skew carries no `enum`.** The Viable MCP connector is installed
from a moving `npx` range and talks to a separately deployed platform, so an executor kind it sends
must remain an unused capability on an older platform rather than a refused session.

**A ceiling exists once.** The inquiry answer cap here equals `DEFAULT_INQUIRY_ANSWER_CHARS` in
`@owlmeans/llm-common` and must stay equal; two ceilings mean the larger one truncates silently
at the smaller.

**A new connector route is declared here first**, then bound in every runtime that serves or calls
it — a route declared on one side alone is an unexplained 404.

## Common pitfalls

- Importing `./intent` from the barrel — it is the one subpath the barrel does not re-export.
- Computing a conversion transition at a call site instead of `conversionStageHelper.stageAfter` /
  `.canEnter`.
- Adding a required key to `SlotMetadata` — the publisher refuses a body with a key it does not
  know, so new keys are optional and omitted while unset.
- Redeclaring a project refusal downstream — unmarshalling is by type name, last registration wins,
  and `instanceof` breaks.
- Passing a card id into a target file instead of the story code.
- Putting agent-only data (skill bodies, case tables) here — it ships in every browser bundle.

## Related packages

- [`@owlmeans/viable-sdk`](../viable-sdk) — the connector SDK written against these contracts
- [`@owlmeans/viable-log`](../viable-log) — target-side analytics and error plugins for the preview channel
- [`@owlmeans/planning`](../planning) — the workcard model the planning module builds on
- [`@owlmeans/agent-common`](../agent-common) — run and pipeline contracts
- [`@owlmeans/llm-common`](../llm-common) — `LlmPurpose`, the inquiry ceilings, spectator contracts
- [`@owlmeans/iam`](../iam) — the IAM vocabulary `./iam-console` re-exports

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
