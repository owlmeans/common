---
node: shadcn
scope: "**/components.json, packages/shadcn*/**, packages/web-*/**"
updated: 2026-10
---

# shadcn UI strategy

A family of web UI packages on shadcn UI + Tailwind CSS v4 replaces the Material-UI (`web-panel`)
family. Development guide: `shadcn-web` skill; version bumps: `shadcn-versions`; test harness:
`testing-ui`; structural reference: `web-panel` / headless logic: `client-panel`.

## Facts

- web-panel's private primitives: alert, alert-dialog, button, card, input, label,
  navigation-menu, popover, progress, separator, sheet (`src/@/components/ui/`).
- `@owlmeans/web-panel/picker` is the standard icon + colour picker (24 palette keys, ~250 static
  lucide icons, opt-in custom hex via react-colorful); `./picker/vocabulary` is its React-free half.
  The root never re-exports it, so only bundles importing the subpath carry the icon catalogue.

## Invariants

The four durable decisions:

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

Flag any deviation in review, especially registry usage or exposed `@/*` exports. Strings and colours:

- No library component reads i18n implicitly: strings come through a `translate` prop (English
  without it); a `use…Translate()` hook (`usePickerTranslate`) exists for apps under `PanelApp`.
- A colour a PERSON chose renders through `styleOf` custom properties (`--pick-*`) read by literal
  utilities, its dark values switched by explicit arbitrary variants (`[.dark_&]:`,
  `[@media(prefers-color-scheme:dark)]:[:root:not(.light)_&]:`) — never the consumer's `dark:`.
- Picker parts never carry `data-slot="button"` or `data-tone`, so a target's large-control rules
  on those never reach them.

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
- A frontend entrypoint with children needs one child declared `default: true`, or the parent's own
  path renders blank.
- A popover opened inside a Dialog/Sheet must be `modal`: a non-modal one is outside the dialog's
  scroll lock and focus trap (wheel dead, focus pulled back). And `@radix-ui/react-popover` must be
  the same Radix generation as `react-dialog` (shared dismissable-layer/focus-scope stacks) — a
  mixed lock puts e.g. popover 1.3 beside dialog 1.1 and breaks both; pin the dev copy to match.
- Tailwind v4 `outline-none` + `focus-visible:outline-2` shows NO outline (`outline-none` pins
  `--tw-outline-style: none`); use `outline-hidden` + `focus-visible:outline-solid`.
- Radix FocusScope returns focus a tick AFTER the content detaches — a spec waits for focus
  (`waitForFunction`), never asserts it right after `detached`.
- A Playwright `isMobile` context lays out at 980px unless the page has a viewport meta; the
  web-panel harness `index.html` carries one.
