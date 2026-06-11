---
name: static-resource
description: How to use @owlmeans/static-resource — Resource for serving static files from a server (e.g. uploaded assets, generated reports). Auto-invoked when serving static files via the framework.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/static-resource

**Layer:** Infra
**Install:** `"@owlmeans/static-resource": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeStaticResource(options)` | Static-file Resource factory |
| `StaticResource` types | Resource interface |
| Constants | Default cache headers |

## Usage

```typescript
import { makeStaticResource } from '@owlmeans/static-resource'

context.registerResource(makeStaticResource({
  alias: 'public',
  root: '/var/lib/app/public',
}))
```

## Depends On

- `@owlmeans/resource`, `@owlmeans/server-context`
