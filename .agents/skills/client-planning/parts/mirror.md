---
name: mirror
description: The state mirror's one id space and fold rules, makePlanningFeed, and optimistic writes with head over seq.
metadata:
  purposes: state, list
  mentions: appendPlanningStores, planningMirrorOf, applyCommitEvent, applyReceipt, applyCards, syncHelper, syncCards, syncLinks, makePlanningFeed, PlanningFeed, useStoreList
---

# @owlmeans/client-planning — The mirror and the feed

## The mirror — one id space

`appendPlanningStores` registers ONE card store for every kind. Projects, cards and specifications
share an id space on the server, so they share one store here: a store per kind lets a card list
that reloads drop the projects beside it.

That is also why a list reaches the store through **`syncHelper.syncCards(store, items, where)`,
never `replace()`**: every card given is written, every card matching `where` that the list does not
name is dropped, and everything outside `where` is left alone. An unchanged card is not rewritten, so a
periodic re-seed wakes no subscriber. `opts.keep` protects ids a commit wrote while the list was in
flight.

The fold rules, shared by `syncHelper.syncCards`, the mirror's `applyCards` and `applyCommitEvent`, and
`commits.wait`:

- an OLDER `seq` never overwrites a newer record — frames and list answers race;
- a committed `delete` removes the row and every link touching it; a project's delete also drops
  the rows whose `parents` hold it (the server purged them in the same fold);
- a frame for an id the store never saw still writes a row;
- a `failed` commit leaves the card alone and records the reason in the commit store;
- a frame without `record` (a cross-process bus carries ids only) is re-read through the facade —
  without one, only the commit row is written;
- a committed `link`/`unlink` re-lists the card's outgoing links; links written together with a
  `create` arrive with the next link seed.

## The feed

```typescript
const feed = makePlanningFeed(context, {
  query: { parent: shedId, type: 'shed:tool' },
  filter: { project: shedId },
  refresh: 15_000,
  onChange: state => setState(state),
})
await feed.ready          // never rejects — read feed.error
// …
await feed.stop()         // stops folding; the shared socket stays open
```

1. Subscribes to commits FIRST (the socket, when an opener exists).
2. Seeds: `cards.list` (unpaged unless the query pages) → `syncHelper.syncCards` over `where`
   (`queryHelper.criteriaOf(query)` by default). A PAGED seed only writes — a page cannot say what
   does not exist.
3. Folds every frame with `planningMirrorOf(stores).applyCommitEvent`, and re-seeds every `refresh`
   ms — the authoritative backstop to a socket that can drop frames.

`connected` reports whether a socket was open when the feed subscribed; `seeded` tells "nothing
there" from "not loaded yet". A React hook wraps the feed in an effect and stops it on unmount.

## Optimistic writes and `head > seq`

`seq` is the last transition folded into a card, `head` the highest allocated. The mirror's
`applyReceipt` (run by `execute` whenever stores are registered) raises the stored card's `head` to
the new transition's `seq`, so `model.pending()` is true before any frame arrives; the commit's fold
brings `seq` up to it. The mirror only ever grows `head`, so a list fetched before the append does not
clear the marker. A model's `expectSeq` default and its `WorkcardConflict` are `planning` → Models.
