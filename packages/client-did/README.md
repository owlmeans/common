# @owlmeans/client-did

Client-side DID wallet service for managing decentralized identity keys in browser environments.

## Overview

- `makeWalletService(alias?)` — creates the DID wallet service for client context registration
- The service wraps `@owlmeans/did`'s `makeWallet()` with browser-compatible storage
- Used by the authentication flow when the app uses Ed25519-based DID authentication

## Installation

```bash
bun add @owlmeans/client-did
```

## Usage

Register the wallet service in context setup:

```typescript
import { makeWalletService } from '@owlmeans/client-did'

// In context.ts
context.registerService(makeWalletService())
```

Access from a component (via auth service):

```typescript
import { DEFAULT_ALIAS } from '@owlmeans/client-did'

const walletService = context.service(DEFAULT_ALIAS)
const key = await walletService.getKey({ entityId })
```

## API

### `makeWalletService(alias?): WalletService`

Creates the DID wallet service. `alias` defaults to a standard DID wallet alias.

### `DEFAULT_ALIAS`

Default service alias for the wallet service.

## Related Packages

- [`@owlmeans/did`](../did) — `makeWallet` called internally
- [`@owlmeans/client-auth`](../client-auth) — uses the wallet service during authentication

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
