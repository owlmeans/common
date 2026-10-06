# __APP_NAME__

__APP_DESCRIPTION__

An OwlMeans application has shared protocol declarations in `sources/common`, server bindings in
`sources/api`, and browser bindings/screens in `sources/web`. Contracts, request schemas, guards
and gates are declared once in common; runtime packages bind them without changing the declaration.

Use `bun run build` from the project root to build every workspace.

Logging goes through `@owlmeans/log`. The api's level comes from `LOG_LEVEL` (default `info`) and
`LOG_DEBUG` (scopes forced to debug, `*` for all); the web build's from `VITE_LOG_LEVEL` (default
`debug` under `vite`, `info` in a build) and `VITE_LOG_DEBUG`. Put local values in
`sources/api/.env` / `sources/web/.env` (git-ignored).
