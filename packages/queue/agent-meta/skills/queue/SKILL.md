---
name: queue
description: How to use @owlmeans/queue — abstract job-queue interface (currently a stub) to be implemented by transport-specific queue services. Auto-invoked when importing queue types.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/queue

**Layer:** Infra
**Install:** `"@owlmeans/queue": "^0.1.18-rc.0"` in `dependencies`

## Key Exports

This package is currently a stub that defines the queue interface. Concrete implementations (Redis BullMQ, RabbitMQ, etc.) will register a service that satisfies this interface.

| Export | Description |
|--------|-------------|
| Queue types (placeholder) | Abstract queue interface |

## Usage

```typescript
// Reserve the alias for your queue implementation
import type { Queue } from '@owlmeans/queue'
const queue = ctx.service<Queue>('queue')
```

## Depends On

- `@owlmeans/context` — service registration
