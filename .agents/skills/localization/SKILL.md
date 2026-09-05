---
name: localization
description: OwlMeans localization conventions — tiered namespace model, compound-prefix keys, 7-language requirement, override pattern, and language switcher. Auto-invoked when adding UI strings, translation keys, language files, or working with i18n in any package.
---

# OwlMeans Localization Conventions

## Canonical language set

```typescript
import { SUPPORTED_LNGS } from '@owlmeans/i18n'
// ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de']
```

**Rule: every new key must be present in all 7 language files in the same commit.** No English-only additions.

## Addressing model (tiered shared namespace)

Keys are addressed as: `(namespace, resource.prefix.key)`.

| Who registers | Helper | namespace | key path |
|---|---|---|---|
| `@owlmeans/*` library package | `addI18nLib` | `'lib'` | `resource.prefix.key` |
| App or shared project package | `addI18nApp` | resource name | `resource.prefix.key` |

The **resource name** is a stable identifier for the registering package, e.g. `'errors'`, `'payment'`, `'viable-manager-web'`.

## Compound prefix keys

A key like `t('title')` resolves to `namespace : resource.prefix.key`. The prefix is composed by joining segments with `.` via `composePrefix` — exported from `@owlmeans/client-i18n` (and re-exported by `@owlmeans/web-panel` and `@owlmeans/mui-panel`), never by hand-concatenating strings.

Example chain:
```
addI18nApp('en', 'viable-manager-web', data)
// data = { "home-screen": { "title": "Welcome" } }

const t = useI18nApp(undefined, 'home-screen')
// → namespace: 'viable-manager-web', keyPrefix: 'viable-manager-web.home-screen'

t('title')
// → 'viable-manager-web' : 'viable-manager-web.home-screen.title' → "Welcome"
```

## Context-based prefix switching

Use `PanelContext` (from `@owlmeans/client-panel`) to inject `resource`, `ns` or `prefix` into a
React sub-tree. Child components that call `usePanelI18n()` pick those three up, and a nested
`PanelContext` inherits the outer one field by field.

```tsx
// Read a library's own bundle from inside an app sub-tree
<PanelContext resource="payment" ns="lib" prefix="plan">
  <Text name="label.monthly" />  {/* usePanelI18n() → lib:payment.plan.label.monthly */}
</PanelContext>
```

`suppress` is **not** one of them. `TPanelContext` accepts it because it spreads `I18nBaseProps`,
but `usePanelI18n` reads only `prefix`, `resource` and `ns`, so a `<PanelContext suppress>` changes
nothing for any child. Suppression is per component, from that component's own `i18n` prop — which
is what `Button` and `ActionCtrl` check before translating a label.

**Form fields sit in a different context.** `useFormI18n` reads the form context that `FormContext`
publishes from the enclosing `Form`'s own `i18n` and `name` props; it never touches `PanelContext`.
So wrapping a form or a field in `<PanelContext …>` changes nothing for any field — redirect a
field by naming the enclosing `Form` or by giving that `Form` an `i18n` prop.

Use the `i18n` prop on an individual component to override just one level. It is declared by the
components whose props extend `I18nProps` — `Block`, `Text`, `Link`, `Status`, `Button` and `Form`
in both panel families:
```tsx
<Status i18n={{ prefix: 'my-status' }} />
```

Not every component carrying copy has it, and the two that lack it read different contexts.
`TextInput` — props extend `FormFieldProps` (`name`, `def`) and add `label`, `placeholder`, `hint`,
`type` and `disableAutocomplete` — resolves `<name>.label`, `<name>.placeholder` and `<name>.hint`
through `useFormI18n` when the matching prop is `true`, and renders the prop's own string when it
is given one; redirect it through the enclosing `Form`. `ButtonSelector` — `SelectorProps` is `name`,
`current`, `options` and `onSelect` — renders one `Button` per option labelled `<name>.<option>`,
and `Button` resolves through `usePanelI18n` with the app `buttons` and `lib:client-panel.buttons`
fallbacks; a surrounding `PanelContext` is what redirects it.

## App-level override of library strings

App-tier registrations deep-merge over Library-tier for the same `(ns, resource)` — and the
namespace has to be said out loud, because `addI18nApp` defaults it to the **resource** name while
the library's bundle sits in `lib`:
```typescript
import '@owlmeans/error'                              // Library tier: lib:errors.*
import { addI18nApp, LIB_NAMESPACE } from '@owlmeans/i18n'
import myErrors from './i18n/en.json'

addI18nApp('en', 'errors', myErrors, { ns: LIB_NAMESPACE })   // App tier wins for matching keys
```

Drop `{ ns: LIB_NAMESPACE }` and the app bundle lands in namespace `errors` while `useI18nLib('errors')`
reads `lib`. Nothing errors and the library strings keep rendering.

## Per-package checklist

When adding translatable strings to any package:

1. Create `src/i18n/en.json` (and pl, ru, be, uk, es, de in the same commit)
2. Create `src/i18n.ts` registering all 7 languages (see `i18n` skill for the template)
3. Re-export from `src/index.ts`: `export * from './i18n.js'`
4. In components, use `useI18nLib` (library package) or `useI18nApp` (app package) — never hardcode UI strings

## Language switcher

Use `useLanguage()` from `@owlmeans/client-i18n`. The selection is persisted to `localStorage`.

```tsx
import { useLanguage } from '@owlmeans/client-i18n'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'

function LanguageSwitcher() {
  const [lng, setLng] = useLanguage()
  return (
    <select value={lng} onChange={e => setLng(e.target.value)}>
      {SUPPORTED_LNGS.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
    </select>
  )
}
```

## When to use which hook

| Situation | Hook |
|---|---|
| React component in a `@owlmeans/*` library package | `useI18nLib('resource-name', 'prefix')` |
| React component in an app or shared project package | `useI18nApp(undefined, 'prefix')` |
| Inside `usePanelI18n` / `useFormI18n` territory (panel/form context) | `usePanelI18n('name')` / `useFormI18n()` |
| Explicit ns ≠ resource (rare, e.g. DID namespace) | `useI18n('resource', 'ns', 'prefix')` |

Never call `useI18n` directly from product code unless ns and resource genuinely differ.
