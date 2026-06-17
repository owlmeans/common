# @owlmeans/client-module

> **Deprecated reexport shim.** This package re-exports everything from [`@owlmeans/client-entrypoint`](../client-entrypoint). Use that package instead.

## Migration

```diff
- import { elevate, stab } from '@owlmeans/client-module'
- import type { ClientModule } from '@owlmeans/client-module'
+ import { elevate, stab } from '@owlmeans/client-entrypoint'
+ import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

- const ep = ctx.module<ClientModule<T>>(alias)
+ const ep = ctx.entrypoint<ClientEntrypoint<T>>(alias)
```

Type renames:
- `ClientModule` → `ClientEntrypoint`
- `ClientModuleOptions` → `ClientEntrypointOptions`
- `ModuleCall` → `EntrypointCall`
- `ModuleFilter` → `EntrypointFilter`
- `ModuleRef` → `EntrypointRef`
- `RefedModuleHandler` → `RefedEntrypointHandler`
- `ClientModuleError` → `ClientEntrypointError`

See [`@owlmeans/client-entrypoint`](../client-entrypoint) for full documentation.
