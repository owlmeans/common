---
name: localization
description: OwlMeans localization conventions — tiered namespace model, compound-prefix keys, 7-language requirement, override pattern, and language switcher. Auto-invoked when adding UI strings, translation keys, language files, or working with i18n in any package.
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

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

A key like `t('title')` resolves to `namespace : resource.prefix.key`. The prefix is composed by joining segments with `.` via `composePrefix` (never by hand-concatenating strings).

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

Use `PanelContext` (from `@owlmeans/client-panel`) to inject `resource`, `ns`, or `prefix` into a React sub-tree. Child components that call `usePanelI18n()` or `useFormI18n()` automatically pick up the context value.

```tsx
// Override the active namespace/resource for a sub-tree
<PanelContext resource="wl-manager" ns="lib" prefix="wl-dns">
  <DnsForm />  {/* DnsForm calls usePanelI18n() — gets ns='lib', resource='wl-manager', prefix='wl-dns' */}
</PanelContext>
```

Use `i18n` props on individual components to override just one level:
```tsx
<StatusLabel i18n={{ prefix: 'my-status' }} />
```

## App-level override of library strings

App-tier registrations deep-merge over Library-tier for the same `(ns, resource)`:
```typescript
import '@owlmeans/error'                    // Library tier: lib:errors.*
import { addI18nApp } from '@owlmeans/i18n'
import myErrors from './i18n/en.json'

addI18nApp('en', 'errors', myErrors)        // App tier wins for matching keys
```

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
