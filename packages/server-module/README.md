# @owlmeans/server-module

> **Deprecated reexport shim.** This package re-exports everything from [`@owlmeans/server-entrypoint`](../server-entrypoint). Use that package instead.

## Migration

```diff
- import type { ServerModule, ModuleOptions } from '@owlmeans/server-module'
+ import type { ServerEntrypoint, EntrypointOptions } from '@owlmeans/server-entrypoint'
```

Type renames:
- `ServerModule` → `ServerEntrypoint`
- `ModuleOptions` → `EntrypointOptions`
- `ModuleRef` → `EntrypointRef`
- `RefedModuleHandler` → `RefedEntrypointHandler`

See [`@owlmeans/server-entrypoint`](../server-entrypoint) for full documentation.
