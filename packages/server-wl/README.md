# @owlmeans/server-wl

Server-side whitelabeling — provides entity-specific branding and configuration via backend entrypoints.

## Overview

- Exports `entrypoints` array: pre-built server entrypoints that serve WL (whitelabel) configuration to clients
- Provides `provide` action — the handler for the WL configuration endpoint
- Integrates with `@owlmeans/wled` for whitelabel data definitions
- Apps add WL DNS service from `@owlmeans/server-wl-dns` for domain-based entity resolution

## Installation

```bash
bun add @owlmeans/server-wl@^0.1.18-rc.16
```

## Usage

Register WL entrypoints in a backend service:

```typescript
import { entrypoints as wlEntrypoints } from '@owlmeans/server-wl'
import { main, entrypoints } from '@owlmeans/server-app'

await main(context, [...entrypoints, ...wlEntrypoints, ...appEntrypoints])
```

With DNS-based entity resolution (from viable):

```typescript
import { appendWlDnsService } from '@owlmeans/server-wl-dns'
import { wlDnsEntrypoints } from '@owlmeans/server-wl-dns'

appendWlDnsService(context)
await main(context, [...entrypoints, ...wlDnsEntrypoints, ...appEntrypoints])
```

## API

### `entrypoints`

Array of `ServerEntrypoint` instances providing the WL configuration API endpoint.

### `WlConfig` / `WlRecord` (types)

Whitelabel configuration types defining branding, theme, and entity-specific settings.

## Related Packages

- [`@owlmeans/client-wl`](../client-wl) — client-side WL service that fetches from this server
- [`@owlmeans/server-app`](../server-app) — server bootstrap that includes these entrypoints

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
