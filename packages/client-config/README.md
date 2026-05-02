# @owlmeans/client-config

Client-side configuration helper for registering web service endpoints.

## Overview

- `addWebService(cfg, alias, url)` — add a named web service URL to a client config
- Used when configuring which URLs the client uses to reach backend services
- Re-exported from `@owlmeans/server-app` for convenience in full-stack config setup

## Installation

```bash
bun add @owlmeans/client-config
```

## Usage

```typescript
import { addWebService } from '@owlmeans/client-config'
// or via server-app:
import { addWebService } from '@owlmeans/server-app'

const appConfig = config(AppType.Frontend, 'manager-web')
addWebService(appConfig, 'api', 'https://api.example.com')
```

## API

### `addWebService(cfg, alias, url): void`

Registers a web service under `alias` in the config. The client resolves `alias` to `url` when making API calls.

### `ClientConfig`

Extends `BasicConfig` with `web?: Record<string, string>` (service alias → URL map).

## Related Packages

- [`@owlmeans/config`](../config) — base config utilities
- [`@owlmeans/client-context`](../client-context) — context that uses the web service config
