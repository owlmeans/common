---
name: client-panel
description: How to use @owlmeans/client-panel — reusable cross-platform UI panel + form components (auth screens, layouts) and the headless navigation model (usePanelNav) shared by web-panel and native-panel. Auto-invoked when importing panel components or building a navigation menu.
user-invocable: false
---

# @owlmeans/client-panel

**Layer:** Client
**Install:** `"@owlmeans/client-panel": "^0.1.18-rc.22"` in `dependencies`

## Key Exports

Everything below is a **root** export — this package has no `./components` or `./helpers`
subpath. Only auth is split out (see below).

| Export | Description |
|--------|-------------|
| `ClientForm` | The form model: `react-hook-form` + an AJV resolver with `coerceTypes` and `ajv-formats`, publishing a `FormContext` and a loader toggle |
| `FormContext` / `useClientFormContext` | That context, and the hook a renderer reads it with |
| `useFormI18n()` / `useFormError(name, error?)` | The form's `t`, and a field error resolved to a message — `<field>.errors.<type>` → `errors.<type>` → `lib:errors.<type>`, or `<field>.error` → `lib:errors.form-field` when the error carries no type |
| `useFormRef<T>()` | The `MutableRefObject<FormRef>` a caller holds to drive a form from outside: `form`, `update`, `loader`, `error` |
| `InputCtrl` | The headless field controller — resolves `label`/`placeholder`/`hint` from the form namespace when passed `true`, and calls the platform `render` |
| `ActionCtrl` | The headless submit/action controller — three-tier label lookup (form namespace, the app's `buttons` section, then `client-panel`'s), the loader flag, and the bound `action` |
| `schemaToFormDefault(schema)` | Initial values derived from an AJV schema, which is what `ClientForm` uses when no `defaults` are given |
| `PanelContext` / `usePanelHelper()` | Inject `resource`, `ns`, `prefix` or `suppress` into a sub-tree; the parent's values are inherited and overridden field by field |
| `usePanelI18n(name?, override?)` / `usePanelError(name, error?)` | The panel's `t`, and a `ResilientError` resolved through it |
| `useStatusMessage(opts)` | `{ message, variant, ok }` for a status surface — a marshalled error's `:` is rewritten to `.` before lookup, so a key written with a colon never matches |
| `usePanelLayout()` / `useLayoutTitle(name?, alias?)` / `prepareLayoutTitle(title)` | The entrypoint the current layout is rendering, and its translated title |
| `BlockScaling` | `Full` / `Half` / `Wide` — the sizing vocabulary both platform families render |
| `usePanelNav(config)` | Headless navigation model behind a two-layer menu |
| `resolveNavLabel`, `defaultNavLabel`, `defaultNavTranslate` | Label resolution helpers |
| `PanelNavConfig`, `PanelNavSection`, `PanelNavItem`, `PanelNavLink`, `PanelNavModel`, `NavTranslate` | Navigation types |
| `FormProps`, `FormRef`, `FormOnSubmit`, `TFormContext`, `FormFieldProps`, `FormActionProps`, `FormActionRenderArgs`, `InputControllerProps`, `TPanelContext`, `StatusOptions` | The model shapes a renderer is written against |

## Subpath Exports

- `./auth` — `useLoginMethods` and the login model types (`LoginMethodsModel`, `LoginTermsModel`,
  `LoginCreditModel`, `UseLoginMethodsOptions`). Importing it also registers this package's own
  seven-language `client-panel-auth` bundle by side effect.
- `./auth/plugins` — the shapes an auth UI plugin is written against: `Ed22519BasicAuthUIPluginForm`
  and its `Ed22519BasicAuthUIPluginFormSchema`.

`useLoginMethods` is the headless model behind a sign-in screen: which methods are offered, whether
the terms are confirmed, what the credit line says, and a `select` that is deliberately NOT async
(the flow may have to open a window inside the click). The rendering lives in `web-panel` — the
same split the form and navigation models already use. See `login-methods`.

## Usage

```typescript
import { ClientForm, InputCtrl, useFormRef, PanelContext } from '@owlmeans/client-panel'
import { useLoginMethods } from '@owlmeans/client-panel/auth'
```

Nothing here renders. A platform package supplies the JSX, and `@owlmeans/web-panel` re-exports
this package's whole root surface (`export * from '@owlmeans/client-panel'`), so an application can
reach any of it through the platform package it already imports.

The split is not uniform, and the difference matters when reading a screen:

- **The navigation model is wrapped.** `usePanelNav` has no renderer here; `TopNav`, `SideNav` and
  `NavLayout` in `@owlmeans/web-panel` are its only rendering, and an app calls those.
- **The form controllers are used directly.** `ClientForm`, `InputCtrl` and `ActionCtrl` are not
  wrapped by any platform package: `@owlmeans/web-panel`'s `Form` builds its own `useForm` +
  `ajvResolver` and takes only `FormContext` and `schemaToFormDefault` from here, its `TextInput`
  drives `react-hook-form`'s `Controller` itself, and its buttons call `handleSubmit` themselves.
  An application that wants a form laid out its own way imports the three from this package: it
  puts its fields inside `ClientForm` and writes the `render` callbacks `InputCtrl` and `ActionCtrl`
  take.

Read the contracts from the controller you actually use — they differ. `InputCtrl` resolves
`label`/`placeholder`/`hint` only from a boolean `true` and **drops a string**, while
`@owlmeans/web-panel`'s `TextInput` honours a string verbatim.

## Navigation model — `usePanelNav`

The **model lives here, the JSX lives in the platform package.** `usePanelNav` is headless and
cross-platform; `@owlmeans/web-panel` renders it as `TopNav`/`SideNav`/`NavLayout`. Never put a
rendered menu in this package, and never re-derive active state in a renderer.

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
  that matters most. The pathname is the fallback: entrypoint paths are matched exactly
  first, then by longest prefix, so a detail screen under a listed one still belongs to its section.
  A screen listed in no section resolves its section by walking `route.route.parent` upward.
- **`hrefOf` gives a menu entry a real URL**, resolved synchronously from
  `context.entrypoint(alias).path()` — an entrypoint composes its path from its own declaration and
  its ancestors', so matching one is a lookup rather than a guess. It returns undefined for a path
  carrying route parameters (`:id`) — there is no honest URL for a screen whose address is not
  known yet. An alias the app never elevated resolves to null and is skipped rather than taking the
  menu down.

## Depends On

- `@owlmeans/client`, `@owlmeans/client-i18n`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`,
  `@owlmeans/entrypoint`, `@owlmeans/error`, `@hookform/resolvers`
- Peers (host-provided): `react`, `react-hook-form`, `ajv`, `@owlmeans/auth`, `@owlmeans/client-auth`,
  `@owlmeans/config`, `@owlmeans/i18n`, `@owlmeans/router`. No platform UI library — that is the
  point of the split. (`@owlmeans/auth` and `@owlmeans/client-auth` are marked optional.)
- `ajv-formats` is imported at module scope by `ClientForm` but is declared in no dependency section
  of the manifest, which lists `ajv` alone. An install that does not otherwise pull it in fails at
  import time, so declare `ajv-formats` next to `ajv` in the consuming application.
