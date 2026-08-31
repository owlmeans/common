# @owlmeans/wled

Whitelabel ("wled") core — shared types, models, and module declarations for entity-specific branding/content.

## Overview

- `WL_PROVIDE` / `WL_PROVIDE_PATH` — module alias and path for the whitelabel provide endpoint
- `WL_TYPE_COMPANY_INFO`, `WL_TYPE_STYLES`, `WL_TYPE_MEDIA`, `WL_TYPE_DNS` — whitelabel content type discriminators
- Type definitions: `CompanyInfo`, `CustomStyles`, `CustomColors`, `CustomFont`, `CustomMedia`, `CustomBrand`, `ProvideParams`, `ProvidedWL<T>`
- `modules` — array containing the `GET /wl/provide/:entity` declaration
- AJV models under `model/` (e.g., `ProvideParamsSchema`)

## Installation

```bash
bun add @owlmeans/wled
```

## Usage

Use the shared module declarations and types when wiring server- and web-side whitelabel features:

```typescript
import { modules as wlModules } from '@owlmeans/wled'
import type { ProvidedWL, CompanyInfo, CustomStyles } from '@owlmeans/wled'
```

Reference content type discriminators when filtering whitelabel records:

```typescript
import { WL_TYPE_COMPANY_INFO, WL_TYPE_STYLES } from '@owlmeans/wled'

const companyInfo = await wlResource.load(`${entityId}:${WL_TYPE_COMPANY_INFO}`)
```

The actual server handlers live in `@owlmeans/server-wl`; web UI in `@owlmeans/web-wl` / `@owlmeans/client-wl`.

## API

### Constants

- `WL_PROVIDE` — `'wl-provide'`
- `WL_PROVIDE_PATH` — `'/wl/provide/:entity'`
- `WL_TYPE_COMPANY_INFO` — `'company-info'`
- `WL_TYPE_STYLES` — `'styles'`
- `WL_TYPE_MEDIA` — `'media'`
- `WL_TYPE_DNS` — `'dns'`

### Types

`CompanyInfo`, `CustomStyles`, `CustomColors`, `CustomFont`, `CustomMedia`, `CustomBrand`, `ProvideParams`, `ProvidedWL<T>` — re-exported at the root entry.

### `modules`

Array with one declaration: `GET /wl/provide/:entity` (alias `WL_PROVIDE`), with `params` filter using `ProvideParamsSchema`.

### `model`

Submodule exporting AJV schemas (e.g., `ProvideParamsSchema`) and helpers for whitelabel records.

## Related Packages

- [`@owlmeans/server-wl`](../server-wl) — server-side whitelabel handlers (uses `modules` from here)
- [`@owlmeans/web-wl`](../web-wl) — web UI components for whitelabel content
- [`@owlmeans/client-wl`](../client-wl) — client-side whitelabel placeholder

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
