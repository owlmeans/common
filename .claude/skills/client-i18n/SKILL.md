---
name: client-i18n
description: How to use @owlmeans/client-i18n — React i18n context built on i18next, gathers resources from registered packages and provides a translation context. Auto-invoked when importing i18n context primitives in a React app.
user-invocable: false
---

# @owlmeans/client-i18n

**Layer:** Client
**Install:** `"@owlmeans/client-i18n": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `I18nProvider` / `useTranslation` | React context + hook (i18next-backed) |
| `setupI18n(context)` | Wire i18n bundles into the React tree |

## Subpath Exports

- `./utils` — translation key helpers

## Usage

```typescript
import { I18nProvider, useTranslation } from '@owlmeans/client-i18n'

function App() {
  return <I18nProvider><Layout /></I18nProvider>
}

function Title() {
  const { t } = useTranslation('my-package')
  return <h1>{t('title')}</h1>
}
```

## Depends On

- `@owlmeans/i18n`, `@owlmeans/client-context`
- `i18next`, `react-i18next`, `react` (peer)
