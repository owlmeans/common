---
name: types
description: Declaring card, project and specification types and status flows as closed data, the application's own definition properties and base card fields (`app`), the data-defined layers (code, entity, project) and retirement, and the rules every record schema keeps.
metadata:
  purposes: data
  mentions: WorkcardTypeSchema, ProjectTypeSchema, StatusFlowSchema, SpecificationSlot, CodePolicy, makeSchemaRegistry, scopedSchemaHelper, resolveScopedBundle, ScopedSchemaRecord, ScopedSchemaBundle, SchemaStore, putType, putFlow, putAssigneeType, scopedCardTypes, overridable, appSchemaHelper, PlanningAppDeclarations, PlanningAppSchema, registerApp, fieldsSchema
---

# @owlmeans/planning — Types, flows and schemas

## Declaring a type

A `WorkcardTypeSchema` / `ProjectTypeSchema` is plain data registered through a plugin's `schemas`
or `makeSchemaRegistry({ types, flows })`. **Every declaration schema is closed** — these are ALL
the keys:

| Declaration | Required | Optional |
|---|---|---|
| card / specification type | `type` (its key), `kind`, `version`, `fields`, `flows` (at least one), `specifications` | `intrinsic`, `relationships`, `labels`, `code`, `label`, `tone`, `icon`, `overridable`, `app` |
| project type | the same, plus `cardTypes` | `projectTypes`, `scopedCardTypes` |
| flow | `id` (its key), `version`, `statuses` (at least one), `transitions` | `label`, `tone`, `icon`, `overridable`, `app` |
| status | `key`, `intrinsic` | `initial`, `terminal`, `label`, `tone` |
| transition rule | `name`, `from` (status keys or `'*'`), `to` | `label`, `explicit` |

The display name is `label` everywhere; a type or a flow has no `name`, `key` or `description`
(`key` belongs to a status, `name` to a rule). Anything else the application keeps about a type or
a flow — a `description`, an origin's attribute — goes in its `app` bag, which the application
declares (below). As data, `definitions` refuses an extra key with `SchemaInvalid`; in code the
registry does not validate a declaration, so only TypeScript's excess-property check catches it —
keep the literal typed.

- `fields` — the AJV schema of `fields`; the registry compiles and caches it (`validator(type)`).
- `specifications` — the slots this type's cards carry as children. A slot may name its
  specification `type`; otherwise `specificationHelper.specificationTypeOf` takes the only registered specification
  type, then the one sharing the parent type's prefix (`viable:project` → `viable:spec`).
- `code` — `CodePolicy { prefix?, style: random|sequential|slug, length?, uppercase?, uniqueWithin:
  parent|entity, mutable? }`. A code is fixed once minted unless `mutable`.
- `relationships` — the edge types a card may start (`single` = at most one per card).
- `labels` — the allowed labels (any when omitted).
- A project type lists `cardTypes` (and `projectTypes` for nesting) its children may have;
  `scopedCardTypes: true` also admits card types defined as data (below).
- `overridable: true` on a code type or flow opens it to a data-defined override.
- `tone` / `icon` (type, flow) and `tone` (status) — PRESENTATION hints the package stores as free
  text of at most 64 characters, neither validating nor rendering them. Their standard values and
  their standard editor and renderer are `@owlmeans/web-panel/picker`: `tone` a palette key
  (`PICKER_COLOR_KEYS` — red … graphite, 24) or a lowercase `#rrggbb` when the editor allows custom
  colours, `icon` a kebab-case lucide name of its catalogue (`PICKER_ICON_NAMES`). A person edits a
  type's or a flow's mark with `IconColorPicker` and shows it with `IconTile` / `ColorDot`; a
  status's `tone` usually names a meaning the application's own palette maps (`ColorPicker` with
  `colors`). An unknown value renders the picker's fallback (`slate`, `circle`); server code and
  seeds read the data React-free from `@owlmeans/web-panel/picker/vocabulary`.

## Application-declared properties (`app`)

Two kinds of field exist: the custom ones a data-defined type gives its cards (its `fields`,
written by the app's people), and the ones the APPLICATION pregenerates in code for every type,
flow or card. The latter are `PlanningAppDeclarations { type?, flow?, card? }`, declared in
`PlanningPlugin.schemas.app` (and `PlanningServiceOptions.schemas.app`) and served in the bundle
(`bundle.app`, `registry.app()`):

```ts
schemas: { app: {
  type: { properties: { description: { type: 'string', maxLength: 2000 } } },
  flow: { properties: { description: { type: 'string' } } },
  card: { properties: { priority: { type: 'string', enum: ['low', 'high'] } } },
} }
// then a type: { type: 'wm:task', …, app: { description: 'Work items' } }
```

- **Closed form** (`appSchemaHelper.assertDeclarations` → `SchemaInvalid('app:<kind>:…')`): each
  kind is `{ type?: 'object', properties, required? }` and nothing else; property names hold no
  `.` or `$`; every `required` name is declared in the same declaration; outside a browser document
  the schema compiles. A page never compiles (a strict `script-src` refuses Ajv's code generation):
  building, loading or merging a registry there runs the closed-form checks only, and what it
  registers is the bundle its server compiled when the plugins were registered.
- **Merge** (`appSchemaHelper.merge`, run by the server's plugin registry on every `use` and by
  the client over the served bundle): the service's own `schemas.app` first, then each plugin's in
  plugin order (`order` ascending, registration order among equals). Per kind `properties` are
  united — a later declaration of a name replaces the earlier one whole — and `required` is united.
  A plugin replaced by name takes its declarations with it. The result is normalized
  (`type: 'object'`); nothing declared → `undefined` and no `app` key in any bundle.
- **`type` / `flow` → the definition's `app` bag**, closed over the declared properties
  (`additionalProperties: false`; an absent bag reads `{}`, so a `required` property makes the bag
  mandatory). Checked on every data-defined write — `define`, `put*`, `seed`, the wire
  `schema.define` — by `assertTypeSchema(type, flows, app)` / `assertFlowSchema(flow, app)`. A kind
  the application does not declare refuses any bag (`<kind>:<key>:app:undeclared`). Code
  declarations are not validated (as every code declaration); a record written under earlier
  declarations still resolves.
- **`card` → base `fields` of every type of kind `card`**, code or data-defined
  (`registry.fieldsSchema(type)`, compiled by `registry.validator(type)`). The type's schema stays
  the root (its `#/…` references still resolve); each base name absent from its top-level
  `properties` is added as `{}` — so its `additionalProperties: false` never refuses a base field —
  and the base object schema is appended to its `allOf`. A type that declares a base name itself
  narrows it (both apply). Projects and specifications are untouched. A required base field, like a
  newly required type field, refuses every later write of a card that lacks it.
- Without declarations every behavior is the previous one: `fieldsSchema(type)` IS `type.fields`.

## Data-defined types and flows

Card types, assignee types and status flows may also be DATA — `ScopedSchemaRecord`s a store keeps
behind the optional `PlanningStore.schemas` port. Card types and flows layer **code → entity → project**;
assignee types layer **code → entity** and refuse a project-local declaration:

- `code` is the plugin registry (the default), `entity` an organization-wide record
  (`project` absent), `project` a record of one project card. A project record overrides an
  organization one of the same key.
- **Card types, assignee types and flows are data.** A code key is sealed unless its declaration says
  `overridable: true`; project and specification types are always code's (`scopedSchemaHelper.assertOverridable` →
  `SchemaSealed`).
- A record's `version` is its compare-and-set token and is written into the declaration's own
  `version`: a write lands only at its layer's next version, 1 for a new key (`SchemaConflict`).
- The closed-form checks are shared by every store: `scopedSchemaHelper.assertFlowSchema` (the declaration's schema,
  unique status keys, every `to` declared, `from` `'*'` or declared statuses, the `app` bag) and
  `scopedSchemaHelper.assertTypeSchema` (the `card` kind, the `app` bag, a `fields` schema that
  compiles with the base card fields, unique flows that resolve) — `SchemaInvalid`.
- **Retired** means offered for nothing new, still resolved for what uses it: a retired record
  gives way to a live declaration below it, and a key retired in every layer resolves retired —
  present in the bundle's `types`/`flows`, listed in `retired`. A flow cannot be retired while a
  live type of an affected layer still runs it (`scopedSchemaHelper.flowInUse` → `SchemaInUse`).
- `scopedSchemaHelper.resolveScopedBundle(code, records, scope)` is the ONE resolution (pure);
  `scopedRegistryOf` is its read-only registry (`originOf`, `isRetired`; `register*`/`load` refuse). A
  `ScopedSchemaBundle` extends the plain bundle with `scope`, `revision`, `origins`, `retired`, so a
  reader of the plain bundle is unaffected; the code bundle's `app` passes through.
- `SchemaStore`: `list(where)`, `put(record)` (the CAS), `purge({ entityId, project })`,
  `revision(entityId)` (monotonic per organization), optional `watch(listener)`.
- `PlanningFacade.definitions` (present only where the store has the port): `bundle(project?)`,
  `registry(project?)`, `records`, `putType`/`putFlow`/`putAssigneeType` (CAS on the declaration's version),
  `define` (each at its layer's next version, flows first), `seed` (only the keys the layer lacks),
  `retire(kind, key, { project? })`. The declaration still carries its own `version` (any number
  ≥ 1 for `define`/`seed`, which assign the layer's next one; the exact next one for `put*`), and
  a project layer is `{ project: <project card id> }` in the second argument (a `define` call:
  `server-planning` → Creating and reading a card).

## Schema rules

A record schema may become a Mongo `$jsonSchema`, so every exported schema keeps two rules: **no
`integer`** (`number` only) and **every optional property `nullable: true`** (an enum then admits
`null` too). No `oneOf`/`anyOf` inside a record schema. Build type arrays per schema, never share
one object between schemas — ajv may extend a `type` array while compiling. The walk that pins this
is part of the package's own tests.
