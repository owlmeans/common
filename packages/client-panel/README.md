# @owlmeans/client-panel

Schema-driven React form components with react-hook-form integration, i18n, action buttons, and the
headless navigation model.

## Overview

- `ClientForm` — form wrapper with react-hook-form, AJV schema validation, and submit handling
- `ActionCtrl` — i18n-aware button component for form actions (submit, cancel, etc.)
- `InputCtrl` — labeled input field component backed by react-hook-form
- `useFormRef()` — hook to get a ref for programmatic form operations
- `FormOnSubmit` — type for form submission handler functions
- `usePanelNav()` — the model behind a two-layer navigation menu (no JSX)
- Platform-agnostic: used by React web and React Native frontends

## Installation

```bash
bun add @owlmeans/client-panel@^0.1.18-rc.22
```

## Usage

A complete form with submit and cancel actions:

```typescript
import { ClientForm, InputCtrl, ActionCtrl, useFormRef } from '@owlmeans/client-panel'
import type { FormOnSubmit } from '@owlmeans/client-panel'

function CreateProjectForm() {
  const formRef = useFormRef()

  const onSubmit: FormOnSubmit<CreateProject> = async (data) => {
    await ctx.entrypoint<ClientEntrypoint<Project>>('project-create').call({ body: data })
  }

  return (
    <ClientForm schema={createProjectSchema} onSubmit={onSubmit} ref={formRef}>
      <InputCtrl name="title" />
      <InputCtrl name="description" />
      <ActionCtrl i18nKey="project.create.submit" type="submit" />
      <ActionCtrl i18nKey="project.create.cancel" onClick={() => navigate.go('project-list')} />
    </ClientForm>
  )
}
```

## API

### `ClientForm`

React component. Props:
- `schema: AJVSchema` — AJV schema used for validation and default values
- `onSubmit: FormOnSubmit<T>` — called with validated form data
- `ref?` — `useFormRef()` ref for programmatic reset/submit

### `ActionCtrl`

React component for buttons. Props:
- `i18nKey: string` — translation key for button label
- `type?: 'submit' | 'button' | 'reset'`
- `onClick?: () => void`
- `disabled?: boolean`

### `InputCtrl`

React component for labeled inputs. Props:
- `name: string` — field name from the schema
- `type?: string` — input type (text, email, password, etc.)
- `i18nKey?: string` — translation key for label (defaults to field name)

### `useFormRef(): FormRef`

Returns a ref object for programmatic form control.

### `FormOnSubmit<T>`

```typescript
type FormOnSubmit<T> = (data: T) => void | Promise<void>
```

### `schemaToFormDefault(schema): Record<string, any>`

Derives default form values from an AJV schema's `default` fields.

## Navigation model

Navigation is declared as data and rendered by the platform package
(`@owlmeans/web-panel` ships `NavLayout` / `TopNav` / `SideNav` / `Footer`). This package holds only
the model, so both levels of the menu agree on what is active.

```typescript
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

### Types

- `PanelNavItem` — `{ alias, label?, Icon?, hidden? }`; one screen, addressed by entrypoint alias,
  never by URL.
- `PanelNavSection` — `{ name, label?, items, hidden? }`; the first menu level. Pressing it goes to
  the first visible item.
- `PanelNavConfig` — `{ sections }`.
- `PanelNavLink` — `{ alias? | href?, label?, open? }`; a footer link.
- `NavTranslate` — `(key, defaultValue) => string`.

### `usePanelNav(config): PanelNavModel`

Returns `sections` (with `hidden` filtered out), `current` (the active screen's alias or null),
`active` (its section), `showSide`, `isSectionActive` / `isItemActive`, `goSection` / `goItem`
(each returning a handler), and `hrefOf(target)`.

- `showSide` is false when the active section holds a single screen — that is where the "one screen,
  no second level" rule lives; a renderer asks the model rather than counting items.
- The current screen resolves from the router's `location.state.alias` when present, and otherwise
  from the pathname matched against entrypoint paths — exact first, then longest prefix.
  Both are needed: `state` is `window.history.state`, so it is empty on a hard load or deep link. A
  screen listed in no section finds its section by walking its declared `parent` upward.
- `hrefOf` resolves a real URL synchronously so a menu entry can be a proper link (focusable,
  keyboard-operable, openable in a new tab). It returns `undefined` for a path carrying route
  parameters.

### `resolveNavLabel(translate, label, key, alias)`

Resolves a label as literal `label` → `translate(key, defaultNavLabel(alias))` → the humanized
alias. `translate` always reaches a component as a **prop**, defaulting to `defaultNavTranslate`
(which returns the fallback) — a menu must never read an i18n context implicitly, because an app
mounted without an i18n provider throws inside render and blanks the page. `defaultNavLabel`
humanizes the last alias segment
(`my-app:web:user-list` → `User list`). Default key families are `nav.<section>` and
`modules.<alias>`.

## Related Packages

- [`@owlmeans/client`](../client) — `useContext`, `useNavigate` used within form components
- [`@owlmeans/client-i18n`](../client-i18n) — i18n provider required by `ActionCtrl`/`InputCtrl`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
