---
name: auxiliary
description: Assignees, teams, comments and mentions on native store ports, the reply projection, hierarchy admission and project purge.
metadata:
  purposes: planning, data
  mentions: facade.assignees, facade.teams, facade.comments, facade.mentions, manageAssignees, manageTeams, defaultAssigneeId, makePlanningAuth, guardHelper.reply
---

# @owlmeans/server-planning — Auxiliary resources and hierarchy admission

## Auxiliary resources and hierarchy admission

`facade.assignees`, `.teams`, `.comments`, `.mentions` use native versioned ports of
`PlanningStore`. The stock memory, PostgreSQL and Mongo stores implement them. Mutations run
inside the store's organization `unit`; CAS, nickname/authentication uniqueness, schema layers,
canonical links and mentions are validated there. Missing ports raise `PlanningUnsupported`. Assignee type changes recheck incoming typed card
references against the proposed type; a change cannot invalidate a persisted assignment.
Do not add a second host-specific planning resource CRUD layer.

`assignees.list({ retired: false })` means every identity not explicitly retired, including
records with an absent or null retirement flag. The facade translates it to `{ retired: { $ne: true } }`
before the native port reads; `retired: true` selects historical identities and an omitted filter
retains both. Keep this predicate consistent with client mirrors and run its shared conformance
case against memory, PostgreSQL and Mongo; a bare equality to false hides newly created identities.

The request scope supplies trusted `assigneeId` for comment authors and optional
`defaultAssigneeId` for newly created cards. HTTP handlers stamp actor/organization context;
`makePlanningAuth(...).scopeFor` resolves OwlMeans identities when that integration is enabled.
Access resolvers can grant `manageAssignees` and `manageTeams` separately from card writes.
Comments and project/team attachment require writable containing cards/projects. Auxiliary
organization lists require authenticated organization scope; do not infer ACLs from project mode.

All stock HTTP replies use `guardHelper.reply`, which conceals scope failures and applies the
typed planning reply projection. Socket commits use the same projection. Organization `entityId`
stays in native records and verified scopes, and never leaves through records, schema scopes or
nested receipts. Keep business fields and schema definitions unchanged when projecting replies.

Admission and native projection recheck hierarchy, schema fields and endpoint types. Recursive
visibility follows every project ancestor and filters before paging. Definition record reads
use the same recursive visibility as cards. Reparenting validates all
descendants under the prospective schema layer. Ordinary parent deletion refuses existing
children; project purge removes its descendants, comments, mentions, scoped schemas and links,
while retaining organization assignees and reusable teams. Field-backed edges are reconciled in
the persistence unit; named inverse edges are derived read views, never duplicate persisted rows.

Run shared conformance with `resources` and `schemas` capabilities against each native provider;
cover version races, stable mentions, reusable teams, field references, hierarchy and narrowed ACLs.

Project purge uses current card ancestry as ownership. A surviving reparented card retains its
complete transition history, documents and edges even when their cached project id names its former
project. Cached project values may select orphaned records, but must never delete surviving records.
