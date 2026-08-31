# @owlmeans/state

In-memory reactive state management with subscription-based updates for OwlMeans apps.

## Overview

- `createStateResource()` creates an in-memory store that implements the `Resource<T>` interface
- Subscriptions trigger listeners whenever records are created, updated, or deleted
- Used on the client to hold UI state (projects, stories, thinking journal entries) as reactive records
- `DEFAULT_ID` (`'_default'`) is the conventional ID for single-record resources

## Installation

```bash
bun add @owlmeans/state
```

## Usage

Create and register a state resource in context setup:

```typescript
import { createStateResource } from '@owlmeans/state'

// In context.ts
context.registerResource(createStateResource<ProjectState>('project-state'))
```

Subscribe to state changes in a service or component:

```typescript
import { DEFAULT_ID } from '@owlmeans/state'
import type { StateModel, StateResource } from '@owlmeans/state'

const resource = context.resource<StateResource<ProjectState>>('project-state')

const [unsubscribe] = resource.subscribe({
  id: DEFAULT_ID,
  listener: (models) => {
    const [model] = models
    console.log('project updated:', model.record)
  }
})
```

Update state and commit:

```typescript
const [model] = resource.subscribe({ id: projectId, listener: ... })[1]
model.update({ status: 'active' })
model.commit()  // triggers listeners
```

## API

### `createStateResource<T>(alias?): StateResource<T>`

Creates an in-memory resource with subscription support. Registers under `alias` (default: `'state'`).

### `StateResource<T>` (extends `Resource<T>`)

- `subscribe(params): [unsubscribe, StateModel<T>[]]` — subscribe to records by `id`, or to a live
  `query`; returns the current records
- `listen(listener)` — global listener for any change in the resource
- `erase()` — clear all records
- `all(): Promise<T[]>` — every record, as a plain array
- `match(criteria?): Promise<T[]>` — the records the criteria accepts, as a plain array
- `list(criteria?, opts?)` — the `Resource` envelope `{ items, pager }`. Unpaged unless a pager is
  given, so `list()` returns everything

### Criteria

`list`, `match` and a `query` subscription share the criteria language of the server resources — a
bare value is equality, a bare array means "any of these", and `$eq $ne $gt $gte $lt $lte $in $nin
$exists $null $like $ilike $regex $startsWith $endsWith $between $contains $contained $overlaps`
combine under `$and` / `$or` / `$not`. A dotted key reaches into the record; a value of `undefined`
is skipped. `matchCriteria`, `filterRecords` and `sortRecords` are exported for filtering a list
already in hand.

```typescript
const open = await resource.match({ status: 'open' })
const [unsubscribe] = resource.subscribe({
  query: { status: 'open' },
  listener: models => { /* re-runs on every write that changes the answer */ }
})
```

### `StateModel<T>`

- `record: T` — the current record
- `update(data?)` — merge partial data into the record
- `commit(force?)` — apply changes and notify subscribers
- `clear()` — remove the record

### `DEFAULT_ID`

```typescript
const DEFAULT_ID = '_default'  // conventional ID for single-item resources
```

## Related Packages

- [`@owlmeans/resource`](../resource) — `Resource<T>` interface implemented by StateResource
- [`@owlmeans/client`](../client) — `useStoreModel` / `useStoreList` React hooks for state resources

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
