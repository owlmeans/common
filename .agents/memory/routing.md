---
node: routing
scope: "packages/router/**, packages/web-router/**, packages/web-router-react-router/**"
updated: 2026-09
---

# Routing (plugin system)

UI routing is a plugin system; the framework owns the router and react-router is a swappable
plugin. Route trees are built from the entrypoint model ([[entrypoints]]); root `tree.md` maps
the package layers.

## Facts

- `@owlmeans/router` (core L1) is the host: `RouterService` = facade + `RouterPlugin` registry +
  cascade selection (`plugin(env)` returns the highest-priority plugin whose `match(env)` is
  truthy). Holds the neutral `RouteObject` IR (`{index?,path?,children?,Component?}`,
  react-router-shape-compatible) and a pure DOM-free matcher (static/`:param`/nested/index only —
  no splat/optional; a seam is reserved). `ensureRouterService(ctx)` + `defaultRouterEnv()`.
- `@owlmeans/web-router` = default in-browser plugin (History API + matcher + React
  provider/outlet/hooks), priority 0, `match: () => true`, registered by `appendWebRouter(ctx)`
  (web-client does this automatically). No react-router.
- `@owlmeans/web-router-react-router` = opt-in react-router v7 plugin; `appendReactRouter(ctx)`
  registers at priority 100 → wins the cascade. The only supported react-router path.
- SSR is pre-designed (`RouterEnv.{ssr,request}` + cascade) but NOT implemented — browser only.

## Invariants

- `RouterService` facade methods (`outlet/provider/useParams/…/compile`) MUST stay plain writable
  instance properties (not getters) — `@owlmeans/native-router` monkey-patches them.
- `@owlmeans/client`'s `Router` defaults `provide` to `context.router().compile` when the prop is
  omitted; `App` mounts `<Router>` unless `noRouter`. `web-client`'s `provide` export is a
  deprecated `undefined` kept only so downstream `<PanelApp provide={provide}/>` compiles.
- Component-less matches must be pass-through: `makeRouterModel` attaches a `Component` only when
  an entrypoint has a `handle`, so grouping entrypoints sit in the chain without one. `web-router`
  renders via `RouteChain` (walks to the first match WITH a `Component`, publishes that depth on
  `OutletContext`). Rendering `matches[depth]` literally blanks every screen under a handler-less
  group — symptom: empty body on all routes, no console errors.
- Routing is validated by a real-browser Playwright chromium e2e only
  (`packages/web-router/tests/routing.spec.ts`, vite harness; needs
  `bunx playwright install chromium`) — no unit tests, per maintainer direction.
