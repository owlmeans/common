---
name: routing-plugins
description: The pluggable UI routing architecture — @owlmeans/router as plugin host, OwlMeans browser plugin as default (web-router), react-router extracted to web-router-react-router, cascade selection, and the provide decoupling. Load when working on routing/navigation.
metadata:
  type: project
---

OwlMeans UI routing is a **plugin system** (introduced 2026-07-01), replacing direct react-router coupling.

**Why:** the framework was tightly bound to react-router while layering its own entrypoint/guard
navigation idioms; we now own the router and make react-router (and future SSR/native) swappable plugins.

## Shape
- `@owlmeans/router` (core L1) = the **host**: `RouterService` = facade + `RouterPlugin` registry +
  **cascade** selection (`plugin(env)` returns highest-priority plugin whose `match(env)` is truthy).
  Adds `useSearchParams` + `compile` to the facade. Holds the neutral `RouteObject` IR
  (`{index?,path?,children?,Component?}`, react-router-shape-compatible) and a **pure DOM-free matcher**
  (`flattenRoutes`/`rankRouteBranches`/`matchRoutes`, supports static/`:param`/nested/index only — no
  splat/optional; a seam is reserved). `ensureRouterService(ctx)` + `defaultRouterEnv()`.
- `@owlmeans/web-router` = the **default** OwlMeans in-browser plugin (History API + matcher + React
  provider/outlet/hooks). `appendWebRouter(ctx)` registers it (priority 0, `match: () => true`). No
  react-router.
- `@owlmeans/web-router-react-router` = **NEW** opt-in react-router v7 plugin (extracted from the old
  web-router). `appendReactRouter(ctx)` registers it at priority 100 → wins the cascade when added.

## Key invariants / gotchas
- **Native-safety:** `RouterService` facade methods (`outlet/provider/useParams/…/compile`) MUST stay
  plain writable instance properties (not getters) — `@owlmeans/native-router` monkey-patches them.
- **`provide` decoupling:** `@owlmeans/client`'s `Router` defaults `provide` to `context.router().compile`
  when the prop is omitted; `App` mounts `<Router>` unless `noRouter` is set. `web-client`'s `provide`
  export is now a deprecated `undefined` (kept so downstream `<PanelApp provide={provide}/>` still compiles).
- **SSR** is pre-designed (`RouterEnv.{ssr,request}` + priority cascade) but NOT implemented — browser only.
- Tests: routing is validated by a **Playwright chromium e2e** (Category-D), not unit tests —
  `packages/web-router/tests/routing.spec.ts` drives a real browser (vite harness + `mount.tsx`) through
  index/nested/`:param`/static-vs-dynamic/deep-link/back-forward navigation. Needs `bunx playwright install
  chromium`. (Per maintainer direction: no fast unit tests for routing — real-browser e2e only.)

See [[entrypoint-rename]] (entrypoint model the route tree is built from) and root `tree.md`.
