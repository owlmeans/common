---
description: "How to use @owlmeans/client-i18n — React i18next wrapper with lazy bundle loading and language persistence. Use when setting up i18n in a React app or adding translation hooks."
applyTo: "packages/{client-i18n,web-client,web-panel,mui-panel}/src/**"
---

# @owlmeans/client-i18n

**Layer:** Client (React)
**Version:** `"@owlmeans/client-i18n": "^0.1.4"`

## Key exports

| Export | Description |
|--------|-------------|
| `I18nContext` | Provider — wraps the app tree |
| `useI18nLib(resource, prefix?)` | Hook for library strings (ns=`'lib'`) |
| `useI18nApp(resource?, prefix?)` | Hook for app strings (ns=resource name) |
| `useI18n(resource, ns?, prefix?)` | Low-level explicit hook |
| `useLanguage()` | `[lng, setLng]` — read/switch active language |
| `composePrefix(parent?, child?)` | Dot-join for prefix segments |
| `I18nProps`, `I18nBaseProps` | Prop types for i18n overrides |

## Setup

```tsx
import { I18nContext } from '@owlmeans/client-i18n'
<I18nContext config={clientConfig}><App /></I18nContext>
```

## Translation hooks

```typescript
// Library component
const t = useI18nLib('errors', 'form')    // lib:errors.form.*
t('minLength')

// App component  
const t = useI18nApp(undefined, 'home')   // appName:appName.home.*
t('title')

// Language switcher
const [lng, setLng] = useLanguage()
```

## Key invariants

- Use `useI18nLib` in `@owlmeans/*` packages, `useI18nApp` in app/project packages.
- Never hardcode UI strings — always use a translation hook.
- Language is persisted in `localStorage` under `owlmeans-lng`.

## Depends On

`@owlmeans/i18n`, `@owlmeans/client-context`, `i18next`, `react-i18next`, `react` (peer)
