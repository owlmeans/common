---
name: errors
description: Every refusal class with its planning marker and HTTP status, the httpStatus rules for a new refusal, and the eight-language i18n the package registers.
metadata:
  purposes: feedback
  mentions: PlanningError, WorkcardNotFound, IllegalTransition, WorkcardConflict, PlanningRefused, FieldsInvalid, SchemaConflict, SchemaSealed, SchemaInvalid, PlanningForbidden, CommitTimeout, CommitFailed, lib:planning
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/planning — Errors and i18n

## Errors

Every refusal is a registered `ResilientError` whose message is `planning:<marker>:<detail>` —
the marker survives a hop where the class is unknown, so match on it there:

| Class | Marker | HTTP |
|---|---|---|
| `PlanningError` | `planning:` (`fold:out-of-order`, `immutable:<field>`, `malformed:<what>`) | 500 |
| `WorkcardNotFound` | `workcard-not-found:` — also the answer for another entity's card | 404 |
| `UnknownWorkcardType` / `UnknownStatusFlow` | `unknown-type:` / `unknown-flow:` | 422 |
| `ParentNotFound` / `CardTypeNotAllowed` | `parent-not-found:` / `card-type-not-allowed:` | 422 |
| `PlanningRefused` | `refused:` — a plugin middleware said no | 422 |
| `IllegalTransition` | `illegal-transition:<flow>:<transition>:<from>` | 409 |
| `FieldsInvalid` / `LabelNotAllowed` | `fields-invalid:` / `label-not-allowed:` | 422 |
| `SpecificationSlotUnknown` / `SpecificationRevisionConflict` | `specification-slot-unknown:` / `specification-revision-conflict:` | 422 / 409 |
| `RelationshipRefused` / `CodeTaken` | `relationship-refused:` / `code-taken:` | 422 / 409 |
| `WorkcardConflict` | `workcard-conflict:` — stale `expectSeq` | 409 |
| `SchemaConflict` / `SchemaInUse` | `schema-conflict:` (lost version CAS) / `schema-in-use:` (retiring a flow a live type runs) | 409 |
| `SchemaSealed` / `SchemaInvalid` | `schema-sealed:` / `schema-invalid:` | 422 |
| `PlanningForbidden` | `forbidden:<grant>:<target>` — the request's access lacks a grant; `forbidden:writes:<id>` — the card or project is outside its `writes` | 403 |
| `CommitTimeout` / `CommitFailed` | `commit-timeout:` (still pending, nothing undone) / `commit-failed:` | 500 |
| `PlanningScopeMismatch` / `PlanningUnsupported` | `scope-mismatch:` / `unsupported:` | 404 / 500 |

Type names are `PlanningError<Suffix>` (`PlanningErrorWorkcardNotFound`).

**The HTTP column is each class's `static httpStatus`** (the `error` skill's principle; 500 = none
declared): an addressed card that is absent or another entity's is 404, a write the request's
access does not grant is 403, a card whose state or head (or a schema record whose version)
refuses the write is 409, a body naming what the registry, the parent or a schema refuses is 422.
Faults declare nothing, and so does `PlanningError` itself — its three causes share one class, and
a base's static would reach every subclass. A new refusal declares on its own leaf class, and
`tests/error-status.spec.ts` refuses an exported refusal whose status was not decided. A plugin's
plain `throw` inside `before` becomes `PlanningRefused` and answers 422, so a plugin FAULT must
throw a `ResilientError` that declares nothing.

## i18n

Importing the package registers, in eight languages (en, pl, ru, be, uk, es, de, fr), `lib:planning.*` labels (`kind.*`,
`intrinsic.*`, `action.*`, `commit.*`, `format.*`) and one text per refusal type under the shared
`errors` resource (`errors.<TypeName>`), where a panel's error lookup finds it.
