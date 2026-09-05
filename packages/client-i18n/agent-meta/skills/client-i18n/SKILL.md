---
name: client-i18n
description: How to use @owlmeans/client-i18n — React i18n context built on i18next. Auto-invoked when setting up translation in a React app, using translation hooks, or working with language switching.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-i18n

**Layer:** Client (React)
**Install:** `"@owlmeans/client-i18n": "^0.1.18-rc.15"` in `dependencies`

## Purpose

Wraps i18next + react-i18next, lazily loads registered bundles from `@owlmeans/i18n` storage into the i18next instance, and provides hooks for translating strings.

## Key Exports

| Export | Description |
|--------|-------------|
| `I18nContext` | Provider component — wraps the React tree with an i18next instance |
| `useI18nLib(resource, prefix?)` | Hook for library strings (ns=`'lib'`) |
| `useI18nApp(resource?, prefix?)` | Hook for app strings (ns=resource name; defaults to `context.cfg.service`) |
| `useI18n(resource, ns?, prefix?)` | Low-level hook with explicit ns — use when ns ≠ resource |
| `useLanguage()` | `[currentLng, setLng]` — read and switch the active language |
| `composePrefix(parent?, child?)` | Canonical dot-join for prefix chaining; never call manually in panel code — used internally |
| `I18nBaseProps` | `{ resource?, ns?, prefix?, suppress? }` |
| `I18nProps` | `{ i18n?: I18nBaseProps }` |
| `I18nContextProps` | `{ config: ClientConfig }` — what the provider takes |

## Subpath: `./utils`

The instance itself, for a host that has to configure i18next before the tree renders.

| Export | Description |
|---|---|
| `useI18nInstance(config)` | The i18next instance for this application, memoised for the mount |
| `getI18nInstance(config)` | The same instance outside React |
| `setLanguage(lng)` | Persist and switch, without a component — what `useLanguage`'s setter calls |

**There is exactly one instance per document**, created on first request and reused by every later
call whatever config is passed. So configuration is read once, at the first creation, and a plugin
is installed on the instance rather than passed to a second factory:

```tsx
import { useI18nInstance } from '@owlmeans/client-i18n/utils'
import detector from 'i18next-browser-languagedetector'

const instance = useI18nInstance(context.cfg)
instance.use(detector)
```

`@owlmeans/web-panel`'s `render` already does exactly this, so an application on the panel family
needs none of it.

## Setup (app root)

```tsx
import { I18nContext } from '@owlmeans/client-i18n'

function App() {
  return (
    <I18nContext config={clientConfig}>
      <Routes />
    </I18nContext>
  )
}
```

`clientConfig.i18n` is optional; it defaults to `SUPPORTED_LNGS` and `'en'` fallback.

## Language persistence

The active language is persisted in `localStorage` under `owlmeans-lng` and restored on init — but
only when it is in `supportedLngs`, so a stored value that a later release dropped falls back to
`fallbackLng` instead of resolving nothing. Every storage access is guarded, so a browser that
refuses site data still renders.

```tsx
function LangSwitch() {
  const [lng, setLng] = useLanguage()
  return (
    <select value={lng} onChange={e => setLng(e.target.value)}>
      {['en','pl','ru','be','uk','es','de'].map(l => (
        <option key={l} value={l}>{l}</option>
      ))}
    </select>
  )
}
```

## Hooks

### useI18nLib — library packages

```typescript
// In a React component inside a library package
const t = useI18nLib('errors')          // loads lib:errors
const t = useI18nLib('errors', 'form')  // keyPrefix = errors.form
t('minLength')  // → lib:errors.form.minLength
```

### useI18nApp — app-level / project packages

```typescript
const t = useI18nApp()                       // uses context.cfg.service as resource+ns
const t = useI18nApp('my-app', 'home-screen') // explicit resource + prefix
t('title')  // → my-app:my-app.home-screen.title
```

### useI18n — explicit resource + ns

```typescript
// When ns and resource differ (e.g. DID namespace)
const t = useI18n('wallet', 'did', 'createKey')
t('title')  // → did:wallet.createKey.title
```

## Key resolution path

`useI18nLib('res', 'prefix')` → `t('key')`
→ i18next lookup: namespace=`lib`, keyPath=`res.prefix.key`
→ bundle was loaded as `{ res: jsonData }` into namespace `lib`
→ resolved value is `jsonData.prefix.key`

## App-level override of library strings

Import the library's i18n registration **and** register your own version at App tier **in the
library's namespace**:
```typescript
import '@owlmeans/error'               // the library bundle, registered by side effect
import { addI18nApp, LIB_NAMESPACE } from '@owlmeans/i18n'
import myErrors from './i18n/en.json' with { type: 'json' }

// App tier merges last within (ns, resource, lng) — these override the library's 'errors' strings
addI18nApp('en', 'errors', myErrors, { ns: LIB_NAMESPACE })
```

`{ ns: LIB_NAMESPACE }` is what makes it an override. `addI18nApp` defaults the namespace to the
**resource** name, so without it the bundle lands in namespace `errors` while `useI18nLib('errors')`
reads namespace `lib` — nothing errors, nothing merges, and the library strings keep rendering.

A package registers its strings from its own root: `src/i18n.ts` is re-exported by `src/index.ts`,
so importing the package is what loads them. No package publishes an `./i18n` subpath.

## Resource JSON format

The shared instance runs i18next's **v4** JSON format — `compatibilityJSON` is not set and must
not be, because i18next >= 26 accepts only `'v4'` and rejects `'v3'` at compile time. Plurals
therefore use Intl.PluralRules suffixes (`key_one` / `key_other`), never the v3 `key_plural` /
`key_0` / `key_1` forms. No resource in the ecosystem carries a plural-suffixed key today;
`{{count}}` in a message is plain interpolation and is unaffected.

Keep `i18next` and `react-i18next` in step — `react-i18next@17` requires `i18next >= 26.2.0`, and
a dependabot bump of one without the other leaves an unmet peer that installs fine and only
misbehaves at runtime.

## Depends On

`@owlmeans/i18n`, `@owlmeans/client`, `@owlmeans/client-context`, `i18next` (>= 26.2),
`react-i18next` (>= 17), `react` (the one peer). `@owlmeans/client` is what `useI18nApp` reads the
current context from, to default the resource to `context.cfg.service`.
