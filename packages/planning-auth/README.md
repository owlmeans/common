# @owlmeans/planning-auth

Optional authentication identity and group links for OwlMeans planning. It maps a stable provider
and subject identity to a planning assignee and an external group to a planning team, and a trusted
server can use it to attribute newly created workcards. Planning itself stays provider-neutral and
knows no user system. This package does not authenticate anyone, write permission grants or
synchronize group membership: those remain the authentication host's job (@owlmeans/server-auth).

## Installation

```bash
bun add @owlmeans/planning-auth@^0.1.21
```

## Concepts

- **Identity link** — an assignee carries `authentication: { provider, externalId }`. A stable
  provider/subject identity maps to one planning id; nicknames and display names never prove
  identity. External ids belong to their named provider (`'owlmeans'` unless `provider` is set).
- **Assignee schemas** — `makePlanningAuthPlugin()` registers two assignee types: human
  (`planning:human`, authentication required by the default schema) and non-human
  (`planning:automation`, authentication optional). Without `attributeCreates` the plugin is
  schema-only, which is the form a client registers.
- **Creation attribution** — on a trusted server, `attributeCreates: true` fills a missing
  `reporter` from the verified creation context (`createdBy`) and, with a `defaultAssignee`, a
  missing `assignee` (the responsible participant). It fills only missing top-level planning ids;
  trusted creator stamping remains the planning executor's job. `owns` can restrict server
  attribution to the host's workcard types.
- **Adapter** — `makePlanningAuth({ planning: () => scopedFacade, provider })` binds one scoped
  planning facade and exposes `assigneeFor`, `teamFor` and `scopeFor`.
- **Collisions and races** — a nickname collision never retargets an existing participant; the new
  assignee gets a distinct nickname instead. Concurrent creation rereads the identity after a
  conflict, so parallel calls resolve to one assignee.
- **Scope** — `scopeFor` resolves the trusted `profileId`/`userId` into `assigneeId` (used for
  comment authors) and, with a `defaultAssignee`, an optional `defaultAssigneeId`.
- **Teams** — `teamFor` maps an authorized external group to a planning team. Teams carry
  provider-qualified external group ids (`<provider>:<group id>`); membership and permission grants
  remain the authentication host's responsibility.
- **Planning ids only** — planning links always contain planning ids; external identity ids are
  integration metadata. Retirement preserves historical attribution.

## Usage

### Register the plugin

```typescript
import { appendPlanningService } from '@owlmeans/server-planning'
import { makePlanningAuthPlugin } from '@owlmeans/planning-auth'

// trusted server: schemas plus creation attribution
appendPlanningService(context, {
  plugins: [makePlanningAuthPlugin({
    attributeCreates: true,
    defaultAssignee: { externalId: 'agent-runner', nickname: 'agent-runner' },
  })],
})

// browser: the schema-only plugin
context.planning().use(makePlanningAuthPlugin())
```

### Resolve identities, teams and scope

```typescript
import { makePlanningAuth } from '@owlmeans/planning-auth'

// the facade is scoped from verified authentication and organization entity membership
const facade = context.planning().for({ entityId: verifiedEntityId })
const auth = makePlanningAuth({
  planning: () => facade,
  provider: 'external-oidc',
  defaultAssignee: { externalId: 'agent-runner', nickname: 'agent-runner' },
})

const alice = await auth.assigneeFor({ externalId: 'subject-1', nickname: 'Alice' })
// same id later, whatever nickname the provider sends
const again = await auth.assigneeFor({ externalId: 'subject-1', nickname: 'Changed display name' })

const editors = await auth.teamFor({ externalId: 'group-1', name: 'Editors' })
// editors.externalId === 'external-oidc:group-1'; no members are added

const scope = await auth.scopeFor({ entityId: verifiedEntityId, profileId: 'app:user-1' })
// scope.assigneeId (reporter / comment author), scope.defaultAssigneeId (non-human default)
```

### Viable

Viable uses this plugin through its planning integration (`makeViablePlanningAuthPlugin`): a
verified user-story creator is the default reporter, and the stable internal non-human agent is the
default assignee. Compatibility backfill verifies creator membership before linking historical
stories. Generated applications may opt into the same integration without depending on viable.

## API

| Export | Kind | Purpose |
|---|---|---|
| `makePlanningAuthPlugin(opts?)` | function → `PlanningPlugin` | Assignee schemas; with `attributeCreates: true` also the server `before` hook that fills missing `reporter` / `assignee` on create. Name `'planning-auth'`, order `-100` unless overridden |
| `makePlanningAuth(opts)` | function → `PlanningAuth` | The adapter bound to one trusted scoped facade |
| `PlanningAuth` | type | `assigneeFor(identity)`, `teamFor({ externalId, name })`, `scopeFor(scope)`, `plugin` |
| `PlanningAuthIdentity` | type | `{ externalId, nickname, kind?, type?, fields? }` — `kind` defaults to human |
| `PlanningAuthOptions` | type | `planning` (facade factory), `provider?`, `humanType?`, `nonHumanType?`, `defaultAssignee?` |
| `PlanningAuthPluginOptions` | type | `PlanningAuthOptions` without `planning`, plus `name?`, `order?`, `owns?`, `attributeCreates?` |
| `OWLMEANS_PLANNING_AUTH_PROVIDER` | const | `'owlmeans'` — the default provider |
| `PLANNING_AUTH_HUMAN_TYPE` | const | `'planning:human'` — human assignee type, authentication required |
| `PLANNING_AUTH_NON_HUMAN_TYPE` | const | `'planning:automation'` — non-human assignee type, authentication optional |

## Common pitfalls

- Only call the adapter with a facade scoped from verified authentication and organization entity
  membership; never build it from caller-supplied organization ids or creator claims.
- Do not identify a user by nickname or display name — pass the provider's stable subject as
  `externalId`. An empty `externalId` or a nickname with no usable characters is refused
  (`FieldsInvalid`).
- `attributeCreates: true` adds a `before` hook, which a planning client refuses
  (`PlanningUnsupported`); browsers register the schema-only plugin.
- `teamFor` changes neither permission grants nor group membership. Authorize attachment and
  membership through the host's access resolver.
- A `defaultAssignee` without `kind` resolves as non-human; an identity passed to `assigneeFor`
  without `kind` resolves as human.

## Related packages

- [`@owlmeans/planning`](../planning) — planning contracts, `PlanningPlugin`, `PlanningFacade`, `PlanningScope`
- [`@owlmeans/server-planning`](../server-planning) — the server planning host and executor that run the plugin
- [`@owlmeans/client-planning`](../client-planning) — the browser planning client (schema-only plugins)
- [`@owlmeans/auth`](../auth) — authentication contracts the verified identity comes from
- [`@owlmeans/server-auth`](../server-auth) — the authentication host that owns membership and grants

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.21
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
