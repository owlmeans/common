# @owlmeans/module

> **Deprecated reexport shim.** This package re-exports everything from [`@owlmeans/entrypoint`](../entrypoint). Use that package instead.

## Migration

```diff
- import { module, guard, filter } from '@owlmeans/module'
+ import { entrypoint, guard, filter } from '@owlmeans/entrypoint'

- const myModule = module(route(...))
+ const myModule = entrypoint(route(...))
```

Type renames:
- `CommonModule` → `CommonEntrypoint`
- `ModuleHandler` → `EntrypointHandler`
- `ModuleOutcome` → `EntrypointOutcome`

See [`@owlmeans/entrypoint`](../entrypoint) for full documentation.
