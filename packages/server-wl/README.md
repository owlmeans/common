# @owlmeans/server-wl

Server-side whitelabeling — provides entity-specific branding and configuration via backend modules.

## Overview

- Exports `modules` array: pre-built server modules that serve WL (whitelabel) configuration to clients
- Provides `provide` action — the handler for the WL configuration endpoint
- Integrates with `@owlmeans/wled` for whitelabel data definitions
- Apps add WL DNS service from `@owlmeans/server-wl-dns` for domain-based entity resolution

## Installation

```bash
bun add @owlmeans/server-wl
```

## Usage

Register WL modules in a backend service:

```typescript
import { modules as wlModules } from '@owlmeans/server-wl'
import { main, modules } from '@owlmeans/server-app'

await main(context, [...modules, ...wlModules, ...appModules])
```

With DNS-based entity resolution (from viable):

```typescript
import { appendWlDnsService } from '@owlmeans/server-wl-dns'
import { wlDnsModules } from '@owlmeans/server-wl-dns'

appendWlDnsService(context)
await main(context, [...modules, ...wlDnsModules, ...appModules])
```

## API

### `modules`

Array of `ServerModule` instances providing the WL configuration API endpoint.

### `WlConfig` / `WlRecord` (types)

Whitelabel configuration types defining branding, theme, and entity-specific settings.

## Related Packages

- [`@owlmeans/client-wl`](../client-wl) — client-side WL service that fetches from this server
- [`@owlmeans/server-app`](../server-app) — server bootstrap that includes these modules
