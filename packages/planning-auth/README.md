# @owlmeans/planning-auth

Optional authentication identity and group links for OwlMeans planning.

```sh
bun add @owlmeans/planning-auth@^0.1.0-rc.2
```

Register `makePlanningAuthPlugin()` for the human/non-human schemas. On a trusted server,
`attributeCreates: true` fills missing reporters from verified creation context; an optional
`defaultAssignee` supplies the responsible participant. Clients register the schema-only plugin.
`owns` can restrict server attribution to the host's workcard types. Attribution fills only
missing top-level planning ids; trusted creator stamping remains the planning executor's job.

`makePlanningAuth({ planning: () => scopedFacade, provider })` exposes `assigneeFor`, `teamFor` and
`scopeFor`. Stable provider/subject identity maps to a planning id; a nickname collision never
retargets an existing participant. Concurrent creation rereads the identity after a conflict.
`scopeFor` resolves trusted `profileId`/`userId` into `assigneeId` for comment authors and optional
`defaultAssigneeId`. Teams carry provider-qualified external group ids. Membership
and permission grants remain the authentication host's responsibility.

Planning links always contain planning ids. Human authentication is required by the default schema;
non-human authentication is optional. Retirement preserves historical attribution.

Only call the adapter with a facade scoped from verified authentication and organization entity
membership. External ids belong to their named provider; nicknames and display names do not prove
identity. `teamFor` maps an authorized external group to a planning team, without changing either
the permission grants or group membership.

Viable uses this plugin through its planning integration: a verified user-story creator is the
default reporter, and the stable internal non-human agent is the default assignee. Compatibility
backfill verifies creator membership before linking historical stories. Generated applications
may opt into the same integration without depending on viable.

Agent guidance ships in this package's `agent-meta` directory.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.53
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
