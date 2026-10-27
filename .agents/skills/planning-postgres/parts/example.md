---
name: example
description: A lending library's planning plugin, protocol tree and bindings, and how backend code reaches the service.
metadata:
  purposes: planning, server-api, config
  mentions: appendPostgresPlanning, servePlanningEntrypoints, makePlanningProtocols, PlanningPlugin, PlanningPostgresError
---

# @owlmeans/planning-postgres — A worked example

## A worked example

The api binds the tree the shared package declares (an api's own `entrypoints.ts`, outside the
core skill's target wiring); a hand-written backend may register everything in one call instead —
`appendPostgres(context); appendPostgresPlanning(context, { plugins: [PLANNING] })`.

```ts
// common: a lending library's branches (projects) and books (cards)
export const PLANNING: PlanningPlugin = {
  name: 'app-planning',
  schemas: {
    flows: [{
      id: 'library:circulation', version: 1,
      statuses: [
        { key: 'shelved', intrinsic: IntrinsicStatus.Planned, initial: true },
        { key: 'lent', intrinsic: IntrinsicStatus.InProgress },
        { key: 'retired', intrinsic: IntrinsicStatus.Closed },
      ],
      transitions: [
        { name: 'lend', from: ['shelved'], to: 'lent', explicit: true },
        { name: 'return', from: ['lent'], to: 'shelved', explicit: true },
      ],
    }],
    types: [
      { type: 'library:branch', kind: WorkcardKind.Project, version: 1, fields: { type: 'object' },
        flows: ['library:circulation'], specifications: [], cardTypes: ['library:book'], scopedCardTypes: true },
      { type: 'library:book', kind: WorkcardKind.Card, version: 1, fields: { type: 'object' },
        flows: ['library:circulation'], specifications: [] },
    ],
  },
}
export const planningProtocols = makePlanningProtocols({
  base: { alias: 'library:planning', path: '/planning' }, guards: DEFAULT_GUARD, definitions: true,
})

// api: the protocol bindings
...servePlanningEntrypoints(planningProtocols)
```

Writing and reading from backend code is `server-planning` → Creating and reading a card (the
call, the read back, `define`, and the wrong forms). A target registers the service as a plain
service (`services/planning.ts` in the core skill's target wiring), so there is NO
`ctx.planning()`: reach it as
`ctx.service<PlanningHostService>(PLANNING_SERVICE).for({ entityId, profileId })`, with `entityId`
taken in the HANDLER (`server-planning` → Scope and security, in its `serving` part) and passed
down. This store keeps schemas, so `definitions` is always present.

The first store call into a missing resource throws
`PlanningPostgresError('resource-missing:planning-schema: add src/resources/planning/schema.ts')`,
naming the file to add.
