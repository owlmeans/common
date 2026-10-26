---
name: mounting
description: The protocol tree makePlanningProtocols declares (leaves, routes, aliases, guards, the commit socket) and how a generated target mounts it.
metadata:
  purposes: server-api, config
  mentions: makePlanningProtocols, planningAliasHelper, planningAliases, planningDefinitionAliases, PLANNING_PATH, socketBase, ExecuteRequest, CommitQuery, CommitFeedQuery, schema.define
---

# @owlmeans/planning — The protocol tree and mounting

## The protocol tree and mounting

`makePlanningProtocols({ base: { alias, path?, parent?, service? }, guards, gate?, socketBase?, definitions? })`:

| Leaf | Route | Request → reply |
|---|---|---|
| `schema.list` | GET `/schemas` | → `PlanningSchemaBundle` |
| `card.list` | GET `/cards` | query `WorkcardQueryWire` → `ListResult<Workcard>` |
| `card.summary` | GET `/cards/summary` | query `SummaryQueryWire` → `SummaryView` |
| `card.get` | GET `/cards/:id` | → `Workcard` |
| `card.transitions` | GET `/cards/:id/transitions` | query `TransitionQueryWire` |
| `card.specifications` | GET `/cards/:id/specifications` | query `SpecificationQueryWire` |
| `spec.get` / `spec.revisions` | GET `/specifications/:id` / `…/revisions` | query `RevisionsQuery` |
| `link.list` | GET `/links` | query `RelationshipQueryWire` |
| `transition.get` | GET `/transitions/:transition` | → `Transition` |
| `execute` | POST `/execute` | body `ExecuteRequest` → `TransitionReceiptView` |
| `commit.get` | GET `/commits/:transition` | query `CommitQuery { wait? }` → `CommitStatus` |
| `commit.events` | SOCKET `/commits` | query `CommitFeedQuery` → `CommitEvent` frames |
| `schema.define` (with `definitions: true`) | POST `/schemas` | body `SchemaDefineRequest { project?, mode?, types?, flows?, retire? }` → `SchemaDefineReply { records, bundle }` |

- Aliases derive from the base alias (`planningAliasHelper.planningAliases(base)` → `<base>:card:list`, …); two mounts
  are two base aliases. `definitions: true` adds `schema.define` (its alias from
  `planningAliasHelper.planningDefinitionAliases(base)`, kept apart so a tree without it names no undeclared alias)
  and gives `schema.list` a `SchemaListQuery { project? }` answered with that layer's scoped bundle.
  Without it the tree declares exactly the other leaves.
- The guards and the gate sit on the base alone; every HTTP leaf inherits them. `path` defaults to
  `/planning`.
- Static `/cards/summary` is declared before parametric `/cards/:id`.
- The commit socket hangs under `socketBase` when given and then inherits THAT base's guards —
  pass an update/socket base that authenticates; otherwise it hangs under the planning base.
- `actor` in an execute body is ignored on the wire: the server fills it from the request.
- Responses carry no runtime schema (typed only), so a serializer never strips `fields`.

## Mounting in a target

A generated target serves this tree as it is — no hand-written card, transition, schema or document
routes; domain rules are `before` plugins. This section is the hub; each package skill has its half.

- **common** declares the one tree the api and the web share: `makePlanningProtocols({ base: {
  alias: 'api:planning' }, guards: DEFAULT_GUARD, definitions: true, resources: true })`, in its own module beside
  the `PLANNING` plugin (`sources/common/src/planning.ts`).
- **api** — `server-planning` → Mounting in a target (stock handlers, no commit socket, the
  resolver answering `writes`). **web** — `client-planning` → Mounting in a target. **store** —
  `planning-postgres`.
- **Kit literals**: card types and flows are LITERAL objects in `PLANNING.schemas.flows` / `.types`,
  above the `// owlmeans: add planning flows|types above this line` sentinels — a spread or an
  imported constant hides them from the library's registration checks. Card types and flows carry
  `overridable: true` with open `fields` (`additionalProperties: true`); the container project type
  (always sealed) carries `scopedCardTypes: true`, so the app's people override and extend them as
  data through `schema.define`.
- What the app itself keeps about every type, flow or card (a type's `description`, an origin's
  attribute planning has no key for) is `PLANNING.schemas.app` — never an extra key on a type or a
  flow (the `types` part, Application-declared properties).
