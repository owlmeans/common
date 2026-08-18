---
name: client-panel
description: How to use @owlmeans/client-panel — reusable cross-platform UI panel + form components (auth screens, layouts) shared by web-panel and native-panel. Auto-invoked when importing panel components.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-panel

**Layer:** Client
**Install:** `"@owlmeans/client-panel": "^0.1.18-rc.6"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `components` submodule | Cross-platform panel/form components |
| `helpers` submodule | Layout / form helpers |

## Subpath Exports

- `./auth` — auth-related panel components
- `./auth/plugins` — pluggable auth panel pieces

## Usage

```typescript
import { Panel } from '@owlmeans/client-panel'
import { LoginPanel } from '@owlmeans/client-panel/auth'
```

`@owlmeans/web-panel` re-exports these and provides the Material-UI implementations.

## Depends On

- `@owlmeans/client`, `@owlmeans/client-auth`, `@owlmeans/client-i18n`
- `react` (peer)
