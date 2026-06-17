# @owlmeans/client-i18n

React i18next adapter that loads translations registered via `@owlmeans/i18n` into react-i18next.

## Overview

- `I18nContext` — React provider component that initializes i18next with resources from `i18nStorage`
- `useI18nApp(ns?)` — hook that returns a translation function scoped to the app namespace
- `useCommonI18n(ns?)` — hook for shared/common i18n strings
- Bridges `@owlmeans/i18n`'s storage format to react-i18next's resource bundles

## Installation

```bash
bun add @owlmeans/client-i18n
```

## Usage

Wrap the app with the i18n provider:

```typescript
import { I18nContext } from '@owlmeans/client-i18n'

function App() {
  return (
    <I18nContext lng="en">
      <AppContent />
    </I18nContext>
  )
}
```

Translate strings in a component:

```typescript
import { useI18nApp } from '@owlmeans/client-i18n'

function ProjectTitle({ titleKey }: { titleKey: string }) {
  const t = useI18nApp('manager-web')
  return <h1>{t(titleKey)}</h1>
}
```

## API

### `I18nContext`

React provider component. Props: `lng: string`, `children: ReactNode`.

### `useI18nApp(ns?): TFunction`

Returns a react-i18next `t()` function scoped to the app-level namespace.

### `useCommonI18n(ns?): TFunction`

Returns a `t()` function for shared/common translations.

## Related Packages

- [`@owlmeans/i18n`](../i18n) — `addI18nApp`, `addI18n` to register translations before render

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
