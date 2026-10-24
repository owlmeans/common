---
name: aux-mirrors
description: The assignee, team, comment and mention mirrors and resource feeds, and the authenticated scope lifecycle (scopeKey, close, lifecycle.run and lifecycle.mutate).
metadata:
  purposes: state, auth
  mentions: makePlanningResourceFeed, scopeKey, lifecycle.run, lifecycle.mutate, registerFeed, client:scope-changed, PlanningReply
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-planning — Auxiliary mirrors and the scope lifecycle

## Auxiliary mirrors and authenticated scope lifecycle

With `resources: true` in the shared protocol tree, every remote facade exposes the complete
assignee/team/comment/mention API, including versioned writes, team membership and project
attachment. `appendPlanningStores` registers separate stock typed mirrors for all four resources.
`makePlanningResourceFeed` seeds and polls selected resource queries; use it with the stock stores
and `useStoreList` / `useStoreModel`. Auxiliary writes update the mirror only after success.
An active-assignee query (`retired: false`) includes an absent or null retirement flag. Local
mirror queries and feed reconciliation use `{ retired: { $ne: true } }`, matching the native
facade rather than strict equality to false. A filtered poll removes only its unchanged matching
snapshot rows, preserving unrelated retired identities needed by existing references.
Comments use trusted server authors; mentions are read-only derived cache commands.

Supply `PlanningClientOptions.scopeKey` from authenticated organization entity slug, profile/user
id, session id and authorization revision; return undefined when signed out. Before switching
organization or signing out, **await** `service.close()` before adopting the credential. It cancels
requests and commit waits, invalidates receipts (including already-settled receipts), stops every
registered feed, removes socket subscriptions, closes the carrier and rejects late socket openers.
A stale operation answers `client:scope-changed`; cancellation never rolls back an accepted server
write. A new subscription opens a fresh carrier after close.

Close drains admitted **local** mirror writes before clearing every stock store and schema cache.
New calls during an explicit close are refused, including hosts without `scopeKey`. Concurrent
closes share the boundary. If clearing fails, close rejects and fresh work stays blocked; retain
the old credential and retry close explicitly. An observed identity change also cancels old work
and queues clearing before the new identity's mirror writes. Reload schemas and create fresh feeds
after credential adoption. Feed query scope alone is insufficient for this lifecycle.

The service's `lifecycle` coordinates stock facades, receipts, feeds and schema writes. A custom
mirror integration captures an operation with `lifecycle.run`, performs remote reads through
`operation.wait` with `operation.signal`, then uses `lifecycle.mutate(operation, write)` for local
writes; never hold or nest that queue over a request, socket opener or another queued mutation.
`planningMirrorOf(stores)` accepts `{ lifecycle, operation }` as its optional last argument and
fetches missing frame records/links before entering the queue. Direct mirror/sync helpers without
that option are local primitives: their caller owns isolation and cleanup.

Planning protocols return `PlanningReply<T>` without storage organization identifiers. Stock
facades hydrate records, receipts, schema scopes and socket frames with `entityId: ''` only to
preserve the shared facade shape. That value is an advisory placeholder, never an organization
identity or a credential. Use `scopeKey` and the authenticated organization entity slug for
identity changes and access isolation; native server records keep their verified stable scope.

Resource feed reconciliation snapshots mirror versions before requesting a list. Only unchanged
snapshot rows absent from that response are removed, so a new local write or a newer version
survives an older in-flight poll. Stopped feeds cannot publish. Track custom feeds through
`registerFeed` when their lifecycle must end with the planning service. Card feeds use the same
identity fence and stop registration; component cleanup awaits `stop()` when it must observe a
completed boundary. Stop cancels unresolved seeds and drains admitted local changes without waiting
for the network; neither late callbacks nor authoritative deletion passes may publish afterward.
A schema write from an old generation cannot invalidate a newer generation's cached registry.
