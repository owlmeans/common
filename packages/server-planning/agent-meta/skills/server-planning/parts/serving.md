---
name: serving
description: The commit feed, request scope and security, the access resolver (projects, writes, grants), and mounting the handlers in a target.
metadata:
  purposes: server-api, auth, planning
  mentions: servePlanningEntrypoints, planningHandlerOf, PlanningAccessResolver, makeRequestScope, makePlanningAccessModel, guardHelper, executionHelper, PlanningForbidden
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-planning — Serving the protocol tree

## The commit feed

- **Poll** — `commit.get` answers the status; with `?wait=<s>` (clamped to `maxPoll`, default 55)
  it subscribes, re-polls, and holds until the commit settles or the time is up, answering `pending`
  then — never an error.
- **Notify** — `commit.events` pushes `planning-commit` frames (or `opts.event`) filtered by the
  authenticated entity and optional `project`/`card` query values; a frame without `record` gets the
  card as it reads now. The subscription is released on the socket's `close` frame.
- `execute` with `wait: true` holds at most `maxPoll` seconds whatever `timeout` the body asked for.

## Scope and security

- Without `opts.access`: `entityId` is `makeEntityScope(req).requireEntityKey()`; `opts.scope(req, ctx)` adds a
  `channel` or `service` and can never replace the entity. `actor` and a create's `createdBy` come
  from the request, never the body (`executionHelper.wireExecution` drops a draft's claim, `creatorHelper.withCreator` stamps the
  subject, `creatorHelper.assertCreatorFixed` refuses a body naming `createdBy` — an update never re-owns a card).
- The organization of a scope is the one the request ACTS IN. `makeEntityScope(req).requireEntityKey()` answers
  `req.entity.id`, the stable record id (the token's `entitySlug` only where no entity resolver is
  registered). Behind an OIDC relying party (`@owlmeans/server-oidc-rp`) the acting organization is
  session state: the guard attaches `req.entity` with `id` = the organization claim's frozen
  `entityKey`, so the tenant key survives a rename and follows a switch. Take it in the handler and
  pass it down; never read it from the context or from a body.
- Another entity's card, specification or transition answers `WorkcardNotFound` — the same as an
  absent id — on reads and writes alike (`guardHelper.concealed`).
- Queries arrive in their wire form and are decoded with `wireHelper.decode*Query` before `queryHelper.criteriaOf`, which
  always adds the scope's `entityId`.

### The access resolver

`opts.access: (req, ctx) => Promise<{ entityId, projects?, writes?, grants? }>` is the hosting app's
decision per request; a throw is the request's answer (an `AuthForbidden` answers 403).

- `entityId` is the resolver's — never the token's, never `opts.scope`'s.
- `projects` becomes `PlanningScope.projects`, which the server facade enforces on reads and
  writes. A card is visible when at least one project reached through its recursive parent paths
  is allowed; specifications follow their containing cards. Anything else reads as absent
  (`WorkcardNotFound`, `null`, an empty list); a create under an invisible parent is
  `ParentNotFound`. Links, transitions and commits use current endpoint/card ancestry, with a
  cached project fallback only for purged records. Subscriptions and commit waits enforce the
  same visibility.
- **Narrowed lists, counts and summaries use the allowed recursive descendant IDs before paging.**
  A specification is admitted through the same containing-card hierarchy as a single read.
  Do not replace this with a direct-parent query or a filter applied after pagination.
  `tests/narrowing.spec.ts` and shared hierarchy conformance pin this behavior.
- A person who may see only SOME projects of their organization (a tool-shed volunteer given one
  shed) is expressed here: the resolver answers the project ids the person's grants list as
  `projects`, and omits the key when a grant covers every project — never a hand-written filter in
  each handler.
- `writes` is the subset of projects the person may WRITE in (`projects` are the ones they VIEW).
  `execute` on a card, specification or link needs it to be writable — the recursive ancestor
  rule over `writes`: a card admitted directly or through a writable parent path. A create needs
  every named parent writable; reparenting checks every supplied destination parent. A create at the root
  (no parent, not a project) is refused. `schema.define` of a project layer needs the project in
  `writes`. A refusal is `PlanningForbidden` (403, `forbidden:writes:<id>`), checked before the grants
  and before the executor. NOT governed by it: a project create (`grants.createProjects` alone) and
  the organization layer (`grants.defineSchemas`). A card the scope cannot see is still answered
  as absent by the executor. Omitted — every visible project is writable.
  `tests/writes.spec.ts` pins viewer, writer and omitted.
- `grants` gates the stock handlers' writes: `createProjects` (a project create — `true` for the
  root, a list names the parent projects), `deleteProjects` (the delete of a project card — a list
  names the projects), `defineSchemas` (`schema.define` — `true` for the organization's layer, a
  list names project layers). A `grants` object refuses every flag it leaves out with
  `PlanningForbidden` (403); no `grants` gates nothing. In-process facade writes are not gated.

## Mounting in a target

The api half of the target mount (the common tree and the kit literals: `planning` → Mounting in a
target, its `mounting` part).

- Bind `servePlanningEntrypoints(tree, { access })` WITHOUT the commit socket —
  `.filter(entrypoint => entrypoint.protocol !== tree.commit.events)`: nothing authenticates a
  target's socket after it opens, so the client long-polls (`commit.get` with `wait`, `execute`
  with `wait: true`). Never write card, transition or schema routes beside it.
- The resolver maps container permissions onto the access: `projects` = the containers the person
  may view, `writes` = those they may modify, `grants` = `createProjects` / `deleteProjects` /
  `defineSchemas` from their create and admin rights. A creator sees what they created — stamp
  ownership in a `before` hook and add the card to both lists.
