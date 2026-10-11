---
name: planning-auth
description: Optional OwlMeans authentication integration for generic planning assignees, creation attribution and external group links. Use when linking authenticated profiles or groups to planning without coupling planning contracts to an authentication provider.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/planning-auth

**Install:** `"@owlmeans/planning-auth": "^0.1.0-rc.2"`. Planning itself remains provider-neutral.
Register `makePlanningAuthPlugin()` for human/non-human assignee schemas; the default plugin is
schema-only and safe for clients. Server hosts may set `attributeCreates: true`, `owns` and a
`defaultAssignee` to fill missing top-level reporter/responsible fields from trusted creation context.

`makePlanningAuth({ planning: () => trustedScopedFacade, provider?, humanType?, nonHumanType?,
defaultAssignee? })` creates one context-bound adapter. `assigneeFor({ externalId, nickname,
kind?, type?, fields? })` resolves the stable provider/subject link within the organization entity;
it never identifies a user by display name. Nickname collisions create a distinct nickname rather
than repointing an existing identity. Concurrent creation rereads the stable identity on conflict.

`scopeFor(scope)` resolves verified profileId/userId and returns `assigneeId`, with optional
`defaultAssigneeId`. Use only trusted authenticated scope, never caller-supplied organization ids
or creator claims. `teamFor({ externalId, name })` resolves a provider-qualified external group
link into a reusable planning team. It neither writes permission grants nor synchronizes group
memberships. Hosts authorize attachment and membership through their existing access resolver.

Humans require authentication unless their assignee type explicitly allows omission. Non-human
assignees may be authenticated but do not require it. Keep all relationship references as planning
ids; external identity ids remain integration metadata. Retirement preserves historic attribution.

In viable, `makeViablePlanningAuthPlugin` owns attribution and its stable internal agent identity;
compatibility backfill verifies old creator membership before assigning reporters. Generated targets
use the same adapter when authenticated profile/group mapping is part of their product.

## External docs

- https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability — issuer plus subject is stable
  identity; names and nicknames are unsuitable as authentication keys.
- https://www.rfc-editor.org/rfc/rfc7643.html#section-3.1 — externalId is supplied by the provisioning
  client and scoped to the provisioning domain; retain provider context.
