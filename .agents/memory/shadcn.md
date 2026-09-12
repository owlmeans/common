---
node: shadcn
scope: "**/components.json, packages/shadcn*/**, packages/web-*/**"
updated: 2026-08
---

# shadcn UI strategy

A family of web UI packages on shadcn UI + Tailwind CSS v4 replaces the Material-UI (`web-panel`)
family. Development guide: `shadcn-web` skill; version bumps: `shadcn-versions`; test harness:
`testing-ui`; structural reference: `web-panel` / headless logic: `client-panel`.

## Invariants (the four durable decisions)

- No shadcn registries — primitives are hand-copied into each package's
  `src/@/components/ui/`; no `registries` in `components.json`.
- A package's shadcn primitives and utilities are private implementation files. Its emitted modules
  use relative imports into their own `build/@/` tree; never emit `@/…`, because that alias belongs
  to the consuming app. The consumer supplies peers, not a matching private component tree.
- Wrap `@owlmeans/client-panel` — shadcn packages render the same headless
  form/layout/nav/react-hook-form logic; MUI → shadcn migration touches only rendered JSX.
- The consuming app must add `@source ".../node_modules/@owlmeans/web-panel/src"` to its Tailwind
  entry — the oxide scanner reads the CSS root plus `@source` only and excludes `node_modules`, so
  package-only classes silently never reach the stylesheet. Source ships in the package tarball,
  so the same path works for linked workspaces and fresh installs.

Flag any deviation in review, especially registry usage or exposed `@/*` exports.

## Gotchas

- A menu is DATA, not children (`PanelMenu`). Three things it owns and a hand-rolled dropdown
  gets wrong: a widget row must not be a `DropdownMenuItem` (the item steals the inner button's
  focus and closes the menu on the click); an in-app link cannot use `onSelect`, because the
  anchor's required `preventDefault()` cancels Radix's composed handler and with it the close;
  and the href must resolve synchronously (`entrypoint.path()`, not `url()`) since the content
  mounts at the moment it opens.

- No i18n provider means no implicit i18n read. `renderApp` (`@owlmeans/web-client`) mounts no
  provider, and `usePanelI18n` → `useI18nResource` dereferences `i18n.options` on the empty object
  react-i18next returns without an instance — a throw inside render that blanks the whole app.
  Anything rendered app-wide (nav, footer) takes a translate FUNCTION as a prop with a
  no-i18n default.
- A frontend entrypoint with children needs one child declared `default: true`, or the parent's own
  path renders blank.
