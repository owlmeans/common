---
description: "How to use @owlmeans/queue — abstract job-queue interface (currently a stub) to be implemented by transport-specific queue services."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/queue

**Layer:** Infra
**Install:** `"@owlmeans/queue": "^0.1.11"` in `dependencies`

## Key Exports

Currently a stub for the queue interface. Concrete implementations register a service that satisfies it.

## Usage

```typescript
import type { Queue } from '@owlmeans/queue'
const queue = ctx.service<Queue>('queue')
```

## Depends On

- `@owlmeans/context`
