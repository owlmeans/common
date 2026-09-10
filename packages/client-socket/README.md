# @owlmeans/client-socket

React hook and factory for WebSocket connections via OwlMeans entrypoint routing.

## Overview

- `ws(entrypoint, request?)` — creates a `Connection` from the entrypoint's URL and opens a WebSocket
- `useWs(entrypoint, request?)` — React hook wrapping `ws()` with lifecycle management; it takes an
  alias or an entrypoint
- The returned `Connection` implements `@owlmeans/socket`'s `Connection` interface

## Installation

```bash
bun add @owlmeans/client-socket@^0.1.18-rc.13
```

## Usage

Connect to a WebSocket entrypoint and observe events:

```typescript
import { useWs } from '@owlmeans/client-socket'
import { MessageType } from '@owlmeans/socket'

function ThinkingPanel({ storyId }: { storyId: string }) {
  const conn = useWs('story-thinking', { params: { id: storyId } })

  useEffect(() => {
    if (!conn) return
    const unsubscribe = conn.observe<ThinkingEvent>('thinking-update', async (event) => {
      dispatch({ type: 'update', payload: event.payload })
    })
    return unsubscribe
  }, [conn])
}
```

Direct connection (non-hook):

```typescript
import { ws } from '@owlmeans/client-socket'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

const wsEntrypoint = context.entrypoint<ClientEntrypoint<string>>('story-thinking')
const connection = await ws(wsEntrypoint, { params: { id: storyId } })
```

## API

### `ws(entrypoint, request?): Promise<Connection>`

Builds the entrypoint's URL, opens a WebSocket, and returns a `Connection` once the socket opens.

### `useWs(entrypoint, request?): Connection | null`

React hook version of `ws()`. Returns `null` while connecting. Manages connection lifecycle (opens on mount, closes on unmount).

## Related Packages

- [`@owlmeans/socket`](../socket) — `Connection` interface with `notify`, `observe`, `call` methods
- [`@owlmeans/server-socket`](../server-socket) — server-side connection handler
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — `ClientEntrypoint` passed to `ws()`

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
