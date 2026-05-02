# @owlmeans/static-resource

In-memory `Resource<T>` backed by static config data — for read-only data loaded at startup.

## Overview

- `createStaticResource(alias?, key?)` — creates an in-memory resource populated from config
- `appendStaticResource(ctx, alias?, key?)` — registers it in the context with a `getStaticResource` accessor
- `StaticResourceAppend` — mixin type adding `getStaticResource<T>(alias?)` to context
- Useful for config-driven lookup tables (e.g., product catalogs, permission sets)

## Installation

```bash
bun add @owlmeans/static-resource
```

## Usage

```typescript
import { appendStaticResource } from '@owlmeans/static-resource'
import type { StaticResourceAppend } from '@owlmeans/static-resource'

appendStaticResource<C, T>(context, 'products')

// Access from context
const resource = context.getStaticResource<Product>('products')
const product = await resource.load('product-sku')
```

## API

### `createStaticResource(alias?, key?): Resource<ResourceRecord>`

Creates an in-memory resource. `key` is the config path where data is loaded from.

### `appendStaticResource<C, T>(ctx, alias?, key?): T & StaticResourceAppend`

Registers the static resource and adds `getStaticResource` to the context.

### `StaticResourceAppend`

Mixin interface: `getStaticResource<T>(alias?): Resource<T>`

### `DEFAULT_ALIAS`

`'static'` — default resource alias.

## Related Packages

- [`@owlmeans/resource`](../resource) — `Resource<T>` interface implemented here
