---
name: client-panel
description: How to use @owlmeans/client-panel — reusable cross-platform UI panel + form components (auth screens, layouts) and the headless navigation model (usePanelNav) shared by web-panel and native-panel. Auto-invoked when importing panel components or building a navigation menu.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-panel

**Layer:** Client
**Install:** `"@owlmeans/client-panel": "^0.1.18-rc.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `components` submodule | Cross-platform panel/form components |
| `usePanelNav(config)` | Headless navigation model behind a two-layer menu |
| `resolveNavLabel`, `defaultNavLabel`, `defaultNavTranslate` | Label resolution helpers |
| `PanelNavConfig`, `PanelNavSection`, `PanelNavItem`, `PanelNavLink`, `PanelNavModel`, `NavTranslate` | Navigation types |
| `helpers` submodule | Layout / form helpers |

## Subpath Exports

- `./auth` — auth-related panel components
- `./auth/plugins` — pluggable auth panel pieces

## Usage

```typescript
import { Panel } from '@owlmeans/client-panel'
import { LoginPanel } from '@owlmeans/client-panel/auth'
```

`@owlmeans/web-panel` re-exports these and provides the rendered implementations.

## Navigation model — `usePanelNav`

The **model lives here, the JSX lives in the platform package** — the same split the form and panel
components already use. `usePanelNav` is headless and cross-platform; `@owlmeans/web-panel` renders
it as `TopNav`/`SideNav`/`NavLayout`. Never put a rendered menu in this package, and never
re-derive active state in a renderer.

Navigation is declared as data. A **section** is the first menu level; its **items** are the screens
the second level offers while that section is active. An item addresses a frontend entrypoint by
`alias` and never carries a URL — the router resolves it, so a path that changes shape stays correct
everywhere it is rendered.

```ts
import { usePanelNav } from '@owlmeans/client-panel'
import type { PanelNavConfig } from '@owlmeans/client-panel'

const config: PanelNavConfig = {
  sections: [
    { name: 'home', label: 'Home', items: [{ alias: HOME, label: 'Overview' }] },
    { name: 'demo', items: [{ alias: web.session }, { alias: web.about }] },
  ],
}

const model = usePanelNav(config)
```

`PanelNavModel` carries `sections` (with `hidden` filtered out), `current` (the active screen's
alias, or null), `active` (its section), `showSide`, `isSectionActive` / `isItemActive`,
`goSection` / `goItem` (each returning a handler), and `hrefOf`.

- **`showSide` owns the one-screen rule.** It is false when the active section holds a single
  screen — a second level offering the page you are already on is noise. A renderer asks the model;
  it does not count items itself.
- **Label resolution never touches i18n implicitly.** `NavTranslate` is a `(key, defaultValue) =>
  string` **prop**, defaulting to `defaultNavTranslate`, which returns the fallback. An app mounted
  without an i18n provider (`renderApp` from `@owlmeans/web-client` mounts none) crashes if a menu
  reaches for the panel i18n context: the hook dereferences `i18n.options` on the empty object
  `react-i18next` returns without an instance, and a throw inside render blanks the whole app.
  `resolveNavLabel(translate, label, key, alias)` applies the order — literal `label` →
  `translate(key, humanized)` → `defaultNavLabel(alias)`, which humanizes the last alias segment
  (`my-app:web:user-list` → `User list`). Default key families: `nav.<name>` for sections,
  `modules.<alias>` for items and footer links.
- **Resolving the current screen needs two sources.** The router's `location.state.alias` is
  authoritative but is `window.history.state`, so it is null until the first in-app navigation — on
  a hard page load or a deep link a menu keyed on it alone highlights nothing, on exactly the entry
  that matters most. The pathname is the fallback: resolved entrypoint paths are matched exactly
  first, then by longest prefix, so a detail screen under a listed one still belongs to its section.
  A screen listed in no section resolves its section by walking `getParentAlias()` upward.
- **`hrefOf` gives a menu entry a real URL**, resolved synchronously from
  `context.entrypoint(alias).getPath()`. It returns undefined for a path carrying route parameters
  (`:id`) — there is no honest URL for a screen whose address is not known yet. An alias the app
  never elevated resolves to null and is skipped rather than taking the menu down.

## Depends On

- `@owlmeans/client`, `@owlmeans/client-i18n`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`,
  `@owlmeans/entrypoint`, `@owlmeans/error`
- `react` (peer)
