---
name: viable-common
description: How to use @owlmeans/viable-common — the runtime-free contract package of the OwlMeans Viable platform. Covers the slot command vocabulary and target layouts, the target-shape integrity manifest, the connector protocol and its entrypoints, the conversion vocabulary, the analysis/design/metadata shapes a generated project is described by, the schema conventions every model answer and stored record here is written to (nullable with its type, a nullable enum carrying null, no Record maps in a record schema), and the version-skew rule a name on the wire obeys. Auto-invoked when importing a slot command, a connector or conversion type, a target-integrity helper, or any *Schema this package exports.
user-invocable: false
---

# @owlmeans/viable-common

**Layer:** Cross-cutting domain (contracts only)
**Install:** `"@owlmeans/viable-common": "^0.0.4"` in `dependencies`
**Subpaths:** `.` · `./slot` · `./connect` · `./convert` · `./integrity`
**Runtime-free:** no `@langchain/*`, no filesystem, no Ajv at run time (a devDependency, for the
tests that compile the schemas). It depends on `@owlmeans/entrypoint`, `@owlmeans/route`,
`@owlmeans/error`, `@owlmeans/agent-common` and `@owlmeans/llm-common` and on nothing else.

Every name the OwlMeans Viable platform puts on a wire, on a volume or in a prompt is declared
here once, and the four runtimes that must agree about it — the manager API, the agent, the
publisher/production runtime, and the connector SDK on somebody's laptop — all read the same
declaration. A vocabulary copied instead of imported is how one tree gets two totals, one
refusal two spellings, and one ceiling two values.

## Key Exports

| Subpath | What it declares |
|---|---|
| `.` (barrel) | `SlotMetadata` and the three metadata vocabularies (`metadataConfigs`, `metadataLists`, `metadataSecrets`); `ProjectArea` / `AREA_PATHS` / `AREA_ACCESS` / `AREA_TIER`; `ModelRole` and the viable `ExecutionState`; `ViableSkill` / `ViablePersona` / `VIABLE_SKILLS`; the BA, dev, UX, design and scaffold shapes and their schemas; `ModerationCategory` / `ModerationSubject` / `decideModeration`; the `docs/` metadata paths; `PreviewEventType` |
| `./slot` | `SlotCommandType` and the `SlotFileCommand` / `SlotShellCommand` / `SlotGitCommand` sets, `SubProject`, `WorkloadKind`, the target ports and process markers, `slotOrigin` / `targetRedirectUrisForOrigin` |
| `./connect` | `ConnectTarget`, `ConnectLlm`, `ConnectHarness`, `ConnectExecutor`, `ConnectOpKind`, `ConnectJobKind`/`Status`/`Block`, `ModelTier` + `tierOfRole`/`clampTier`, `ModelTask*`, `InquiryPayload` + `ConnectInquiryKind`, the session/job/status views, the `Connect*` error family, `connectEntrypoints(opts)` and every `*Schema` behind them |
| `./convert` | `ConversionStage`/`Status`/`Decision` and the `stageAfter`/`decisionFor`/`canEnter` transitions, `OriginKind`/`Shape`/`State`, `StackId` + `STACK_FAMILY`, `ArchitectureCase`, `ConvertibilityVerdict`/`Reason`, the census classifiers (`fileClassOf`, `sizeClassOf`, `entropyClassOf`, `binaryByExtension`), the `docs/conversion/` paths, `CONVERTED_ORIGIN_DIR`, `SOURCE_LIST_EXCLUSIONS`, `CENSUS_SKIP_DIRS`, `RELOCATE_ALWAYS_KEEP`, and the model-answer schemas the conversion asks with |
| `./integrity` | `TargetLayout` + `TARGET_LAYOUTS`, `detectTargetLayout`, `verifyTargetShape`, `TARGET_INTEGRITY_FILES`, `TARGET_PROTECTED_FILES`, `isLegacyLayout`, `targetPackageName` |

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

**A field that crosses a version skew carries no `enum`.** Users run `npx -y @owlmeans/viable-mcp`
(always latest) against a separately deployed platform, so `ConnectCapabilitiesSchema.executors.items`
is a bare string: a newer executor kind must stay an unused capability on an older platform, never
a refused session. Apply the same reasoning to anything else a newer connector may send an older
platform, and nowhere else — a closed set is worth more than a tolerant one everywhere both ends
deploy together.

## One declaration, elevated on both ends

`connectEntrypoints(opts)` is the connector's whole HTTP and socket surface — paths, methods,
schemas, parents — and the platform spreads it into its own entrypoints while the SDK elevates the
same list into client entrypoints. That is what makes a path or a schema impossible to get wrong on
one side only. Only what belongs to the DEPLOYMENT is injected: the guard alias, the ownership
gate, the paid local-LLM gate (on the two routes that can turn that mode on) and the platform's own
socket base.

Adding a route means adding it here first, then elevating it on both sides. A route declared on one
side alone is a 404 nobody can explain from the failing end.

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

The platform's own refusals — conversion, moderation, reserved names, integrity — are declared in
the product repo, not here, so a consumer that cannot `instanceof` them matches by MARKER instead:
`@owlmeans/viable-sdk`'s `REFUSALS` map and the manager's `useErrorPhrase` read the same substrings,
which is what stops one refusal being phrased two ways. When a marker changes, both readers change
with it.

## Tests

`bun test ./tests` — offline. `convert.spec.ts` (the three structural walks over the barrel, the
conversion schemas compiling, a nullable enum accepting `null` under Ajv while still refusing an
unknown member, the census classifiers and the stage transitions), `connect-convert.spec.ts` (the
conversion routes at their paths and methods, hanging under the connector base and carrying no paid
gate; capabilities accepting an executor kind this platform has never heard of; the answer and
resume bodies), `design.spec.ts` (the design aggregate, staleness ranking, and the design schema
refusing an undeclared field or an area outside the closed set).

## Depends On

- `@owlmeans/entrypoint`, `@owlmeans/route` — the entrypoint declarations
- `@owlmeans/error` — the `Connect*` error family
- `@owlmeans/llm-common` — `ExecutionEffort`/`ExecutionLevel`, `PromptPolicy`, `LlmPurpose`, and the
  inquiry ceilings this package's copies are pinned to
- `@owlmeans/agent-common` — the run and pipeline contracts a conversion's runs are declared against

## Related

- [[viable-sdk]] — the connector SDK written entirely against these contracts
- [[viable-mcp]] — the npx stdio server built on that SDK
- [[inquiry]] — the primitive `InquiryPayload` mirrors, and the one answer ceiling
- [[llm-common]] — the contracts half of the model runtime
- The DOMAIN rules for what these shapes mean — target areas and navigation, the scaffold, target
  integrity, the metadata files, the converter — live in the downstream repos that implement them
  (`target-areas`, `scaffolding`, `workload-integrity`, `viable-metadata`, `converter`). This skill
  owns the CONTRACT: how a name is declared, and what refuses it.
