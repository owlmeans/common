---
description: "How to use @owlmeans/client-i18n — React i18n context built on i18next, gathers resources from registered packages and provides a translation context."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/client-i18n

**Layer:** Client
**Install:** `"@owlmeans/client-i18n": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `I18nProvider` / `useTranslation` | React context + hook |
| `setupI18n(context)` | Wire i18n bundles into the React tree |

## Subpath Exports

- `./utils`

## Usage

```typescript
import { useTranslation } from '@owlmeans/client-i18n'
const { t } = useTranslation('my-package')
```

## Depends On

- `@owlmeans/i18n`, `@owlmeans/client-context`, `i18next`, `react-i18next`, `react`
