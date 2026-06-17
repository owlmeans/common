# @owlmeans/resource

Abstract CRUD interface and types for all data persistence in OwlMeans applications.

## Overview

- `Resource<T>` interface: `get`, `load`, `list`, `save`, `create`, `update`, `delete`, `pick`
- `ResourceRecord` base type (`{ id?: string }`) that all stored records extend
- `ResourceMaker<R, T>` factory signature used by `makeMongoResource`, `createStateResource`, etc.
- `ListResult<T>`, `ListOptions`, `ListPager` for paginated queries
- Error classes: `ResourceError`, `UnknownRecordError`, `RecordExists`

## Installation

```bash
bun add @owlmeans/resource
```

## Usage

Define a resource maker following the standard factory pattern:

```typescript
import type { ResourceMaker, ResourceRecord } from '@owlmeans/resource'
import { makeMongoResource } from '@owlmeans/mongo-resource'

interface ProjectRecord extends ResourceRecord {
  entityId: string
  alias: string
  createdAt: Date
}

export const makeProjectResource: ResourceMaker<ProjectRecord> = (dbAlias, serviceAlias) => {
  return makeMongoResource<ProjectRecord>('project', dbAlias, serviceAlias, makeProjectResource)
}
```

Use resource methods in a handler:

```typescript
import { UnknownRecordError } from '@owlmeans/resource'
import type { ListResult } from '@owlmeans/resource'

// Get or throw
const project = await ctx.project().get(projectId)

// Load (returns null if not found)
const story = await ctx.story().load(storyId)

// List with criteria and pagination
const result: ListResult<ProjectRecord> = await ctx.project().list({
  criteria: { entityId: req.auth!.entityId },
  pager: { page: 0, size: 20 }
})
```

## API

### `Resource<T>` methods

- `get(id, field?, opts?)` — fetch by ID; throws `UnknownRecordError` if missing
- `load(id, field?, opts?)` — fetch by ID; returns `null` if missing
- `list(criteria?, opts?)` — paginated list; returns `ListResult<T>`
- `create(record, opts?)` — insert; throws `RecordExists` if already exists
- `save(record, opts?)` — upsert by ID
- `update(record, opts?)` — update; throws `UnknownRecordError` if missing
- `delete(id, opts?)` — remove; returns the deleted record or `null`
- `pick(id, opts?)` — like `get` but optimized for existence checks

### `ResourceMaker<R, T>`

```typescript
interface ResourceMaker<R extends ResourceRecord, T extends Resource<R> = Resource<R>> {
  (dbAlias?: string, serviceAlias?: string): T
}
```

### Helpers

- `prepareListOptions(defPageSize, criteria?, opts?)` — normalize list criteria + pager
- `filterObject(obj, keep?)` — strip null/undefined fields from a record before saving

### Error Classes

- `ResourceError` — base resource error
- `UnknownRecordError` — record not found (has `.id` getter)
- `RecordExists` — duplicate record on `create`
- `MisshapedRecord` — invalid record structure

## Related Packages

- [`@owlmeans/mongo-resource`](../mongo-resource) — MongoDB implementation
- [`@owlmeans/redis-resource`](../redis-resource) — Redis implementation
- [`@owlmeans/state`](../state) — in-memory implementation for client state

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
