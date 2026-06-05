---
description: "OwlMeans localization conventions — tiered namespace model, compound-prefix keys, 7-language requirement, override pattern. Apply whenever adding UI strings, JSON translation files, or i18n hooks to any package."
applyTo: "**/*.ts, **/*.tsx, **/i18n/**"
---

# OwlMeans Localization Conventions

## Canonical languages

`SUPPORTED_LNGS` from `@owlmeans/i18n`:
```
en  pl  ru  be  uk  es  de
```

**Every new translation key must exist in all 7 language files in the same commit.**

## Tiered namespace model

| Package type | Register with | namespace | key path |
|---|---|---|---|
| `@owlmeans/*` library | `addI18nLib` | `'lib'` | `resource.prefix.key` |
| App / shared project | `addI18nApp` | resource name | `resource.prefix.key` |

App tier overrides Library tier for the same key.

## Compound prefix keys

```
t('title') via useI18nLib('errors', 'form')
→ namespace='lib', key='errors.form.title'
→ resolves errors.json → form.title

t('title') via useI18nApp(undefined, 'home-screen')
→ namespace='my-app', key='my-app.home-screen.title'
→ resolves my-app i18n data → home-screen.title
```

## Context-based prefix switching

`PanelContext` (from `@owlmeans/client-panel`) injects `{ resource, ns, prefix }` into a React subtree. Children call `usePanelI18n()` / `useFormI18n()` which inherit the context.

```tsx
<PanelContext resource="wl-manager" ns="lib" prefix="wl-dns">
  <DnsSection />
</PanelContext>
```

## Hook selection guide

| Where | Hook |
|---|---|
| `@owlmeans/*` library component | `useI18nLib('resource', 'prefix')` |
| App / project component | `useI18nApp(undefined, 'prefix')` |
| Inside panel/form context | `usePanelI18n('name')` / `useFormI18n()` |
| ns ≠ resource (rare) | `useI18n('resource', 'ns', 'prefix')` |

## Adding a new translatable string — checklist

1. Add key to `en.json`
2. Add the same key (with translation) to `pl.json`, `ru.json`, `be.json`, `uk.json`, `es.json`, `de.json`
3. Use a hook in the component — never hardcode the string

## Language switcher

```tsx
import { useLanguage } from '@owlmeans/client-i18n'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'

const [lng, setLng] = useLanguage()
// persisted to localStorage automatically
```
