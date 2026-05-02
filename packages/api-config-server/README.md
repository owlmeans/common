# @owlmeans/api-config-server

Server-side module that serves safe configuration values at `GET /assets/config.json`.

## Overview

- Registers the `API_CONFIG` handler that returns non-sensitive config fields to clients
- Used alongside `@owlmeans/api-config-client` to push runtime config from server to browser
- Include `modules` in your server module registration

## Installation

```bash
bun add @owlmeans/api-config-server
```

## Usage

```typescript
import { modules as apiConfigModules } from '@owlmeans/api-config-server'

// In your server context setup
context.registerModules([...appModules, ...apiConfigModules])
```

## API

### `modules`

Array of server-side route handlers for the config advertisement endpoint (`GET /assets/config.json`).

## Related Packages

- [`@owlmeans/api-config`](../api-config) — shared types and module alias
- [`@owlmeans/api-config-client`](../api-config-client) — client that fetches this endpoint
