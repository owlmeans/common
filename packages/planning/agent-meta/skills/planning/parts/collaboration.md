---
name: collaboration
description: Assignees, comments with stable mentions, teams across projects, card hierarchy rules, the resources protocol branches, and PlanningReply's organization-free records.
metadata:
  purposes: detail, view
  mentions: Assignee, Team, Comment, CommentMention, mentionHelper, PlanningResourceKind, PLANNING_PROJECT_TEAM, planningResourceAliases, planningReplyHelper, PlanningReply, teams.addMember, reporter, assignee
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/planning — Assignees, comments, teams and hierarchy

## Assignees, comments, teams and hierarchy

Cards retain the transition log; auxiliary records use separate versioned resources. `Assignee`,
`Team`, `Comment` and `CommentMention` have organization scope and `version` compare-and-set.
`PlanningResourceKind` qualifies relationship endpoints so ids from different resources cannot
collide. Omitted endpoint kinds mean `workcard` for stored legacy edges.

Assignees have stable ids, normalized organization-unique nicknames (`mentionHelper.nicknameKey`),
`kind: human | non-human`, `type`, flexible `fields`, optional `authentication: { provider,
externalId }` and retirement. Human types require authentication by default; declare
`authentication: 'optional'` to allow a human without it. Non-human types default to optional.
Authentication is provider-neutral; `@owlmeans/planning-auth` adds the optional OwlMeans adapter.
Code plugins declare `schemas.assigneeTypes`; data definitions use `putAssigneeType` or
`define({ assigneeTypes })`. Assignee schemas are organization-wide, never project-local.

`reporter` and `assignee` are optional top-level single assignee ids. Additional schema fields use
`relationships: [{ name, field, toKind: PlanningResourceKind.Assignee, multiple?, to?, inverse? }]`.
`to` restricts target assignee types. The field is authoritative; the store maintains its canonical
edge and the facade exposes named inverse views. Do not mirror base fields in `fields`, invent
join collections or manually write these derived edges. Retired assignees retain existing links
and comments but cannot receive new assignments or team memberships.

Comments belong to a card and a trusted author assignee. Encode stable mentions with
`mentionHelper.encode(id, nickname)`, producing `[@nickname](assignee:<encoded-id>)`; renaming a
nickname never retargets a mention. `CommentMention` is a separate derived cache with the source
comment `revision`; reads repair interrupted cache updates. Never accept author ids from an
untrusted request or parse ordinary prose as identity.

Teams are organization resources, reusable across projects. `teams.addMember/removeMember` and
`teams.attach/detach` use the existing relationship store, with canonical team-member and
project-team edges. `teams.members(team)` and `teams.projects(team)` read membership and
attachment; `teams.assignees(project)` reads effective assignees. Read project teams through
`relationships.list({ from: project, type: PLANNING_PROJECT_TEAM, toKind: PlanningResourceKind.Team })`;
project assignees are the deduplicated union of attached teams. Team `externalId` may name an
external permission group; links do not mutate authentication group membership.

Hierarchy uses existing `parent` and direct `parents`, with optional derived `parentType`.
Declare compatible `parents: { types?, required? }` and `children: { types }` on card schemas.
Required primary parents cannot be cleared; safe reparenting is supported. Cycles, cross-organization
links, incompatible descendants and deleting an ordinary card with children are refused. The
nearest primary project selects schemas; all project ancestors participate in access checks.
Project `mode` is `opened` (default) or `closed`, separate from flow status; host policy may use it
for access decisions.

Declare `resources: true` on `makePlanningProtocols` to add assignee/team/comment/mention
`get`, `list`, `write` branches and use `planningResourceAliases`. Enable `definitions: true`
for assignee type schema writes. Use stock facade methods, handlers, stores and feeds on both
sides; resource commands and versions are validated by the shared wire contract.

Protocol responses use `PlanningReply<T>`: storage organization metadata (`entityId`) is absent
from records, schema scopes, receipts and commit frames. `planningReplyHelper.project` handles
only known record/envelope positions; custom fields, transition changes and schema definitions
remain opaque. Native facades retain their trusted storage scope. Remote facades hydrate the
shared record shape with empty advisory metadata; never derive organization identity from it.
