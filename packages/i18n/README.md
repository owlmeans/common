# @owlmeans/i18n

Multi-level translation resource registration for OwlMeans applications.

## Overview

- Priority-based i18n resource storage: libraries register at lower priority, apps at higher priority
- Namespace-based organization — translations are grouped by resource name and namespace
- Used at startup to register translation bundles; actual translation rendering is done by the platform-specific i18n package (react-i18next, etc.)

## Installation

```bash
bun add @owlmeans/i18n@^0.1.18-rc.38
```

## Usage

Register translations for a package at startup:

```typescript
import { i18nHelper } from '@owlmeans/i18n'

// Register app-level translations (highest priority)
i18nHelper.addI18nApp('en', 'manager-web', {
  'project.create.title': 'Create Project',
  'project.create.submit': 'Create',
})

// Register library-level translations (lower priority — overridable by apps)
i18nHelper.addI18nLib('en', 'client-panel', { 'form.submit': 'Submit' })
```

## API

All registration and loading goes through the `i18nHelper` object (`createI18nHelper()` builds one
over the same process-wide storage).

### `i18nHelper.addI18nApp(lng, resource, data, opts?)`

Register translations at app tier (highest). Typically called in `src/i18n.ts`.

### `i18nHelper.addI18nLib(lng, resource, data, opts?)`

Register translations at library tier (namespace `lib` by default). App-tier bundles override them.

### `i18nHelper.initI18nResource(lng, resource, ns?)` / `i18nHelper.resolveI18nResource(lng, resource, ns?)`

Drain the bundles of one slot in merge order, or read their merged result without draining.

### `i18nHelper.addI18nLoader(lng, loader)` / `i18nHelper.loadI18nLanguage(lng)` / `i18nHelper.isI18nLanguageLoaded(lng)`

Register lazy language loaders, await them, and check whether they completed.

### `I18nTier`

Priority tiers: `Library` < `App`. App-tier translations win over library translations for the same key.

### `i18nStorage`

The global translation store. Read by platform-specific i18n adapters (e.g. `@owlmeans/client-i18n`).

## Related Packages

- [`@owlmeans/client-i18n`](../client-i18n) — React i18next adapter that reads from `i18nStorage`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.48
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
