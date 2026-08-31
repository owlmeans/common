# @owlmeans/i18n

Multi-level translation resource registration for OwlMeans applications.

## Overview

- Priority-based i18n resource storage: libraries register at lower priority, apps at higher priority
- Namespace-based organization — translations are grouped by resource name and namespace
- Used at startup to register translation bundles; actual translation rendering is done by the platform-specific i18n package (react-i18next, etc.)

## Installation

```bash
bun add @owlmeans/i18n
```

## Usage

Register translations for a package at startup:

```typescript
import { addI18nApp } from '@owlmeans/i18n'

// Register app-level translations (highest priority)
addI18nApp('en', 'manager-web', {
  'project.create.title': 'Create Project',
  'project.create.submit': 'Create',
})

// Register library-level translations (lower priority — overridable by apps)
import { addI18n } from '@owlmeans/i18n'
addI18n('en', 'client-panel', { 'form.submit': 'Submit' })
```

## API

### `addI18nApp(lng, resource, data, opts?)`

Register translations at app priority (highest). Typically called in `src/i18n.ts`.

### `addI18n(level, lng, resource, data, opts?)`

Register translations at a specific `I18nLevel`. Lower levels are overridden by higher ones.

### `I18nLevel`

Priority levels: `Lib` < `Package` < `App`. App-level translations win over library translations for the same key.

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
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
