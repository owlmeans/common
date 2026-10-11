# @owlmeans/common-inquiry

The runtime-free contract of the OwlMeans customer inquiry widget: a visitor opens a dialog from a
host page, picks an intent (a tab), leaves contact details, a message and up to five attachments,
and a CRM service mails it on. Three parties share this package — the browser SDK
(`@owlmeans/web-inquiry`), the widget bundle that renders the dialog, and the CRM API that accepts
the submission — so the names, limits and shapes they agree on live in one place.

No React, no DOM, no runtime dependencies: constants, types, JSON schemas and one pure helper.

## Installation

```bash
bun add @owlmeans/common-inquiry@^0.1.18-rc.1
```

`ajv` is an optional peer: the schemas are typed with its `JSONSchemaType`, and a server that
compiles them brings its own.

## Concepts

- **Widget config** (`InquiryWidgetConfig`): an id, one or more tabs (`alias`, localized `title`
  and `description`), an optional `defaultTab`, the terms and privacy links the inquirer consents
  to, and an optional language. A config with ONE tab renders without a tab strip.
- **Runtime** (`InquiryRuntime`): what the widget bundle `inquiry.js` installs at
  `window.__owlmeansInquiry` — `version`, `configure`, `open`, `button`, `unmount`. Hosts reach it
  through `@owlmeans/web-inquiry`, which checks `version` against `INQUIRY_RUNTIME_VERSION`.
- **Submission** (`InquirySubmission`): one multipart POST to `<crm>/api/inquiry` — text fields,
  `files` as a JSON string of `InquiryFileMeta[]`, and the bytes in `file0` … `file4`.
- **Limits**: 5 000 000 bytes per file, 20 000 000 in total, five files; PNG, JPEG, GIF, WEBP,
  PDF, CSV and plain text only (never SVG).

## Usage

```ts
import { inquiryConfigHelper, type InquiryWidgetConfig } from '@owlmeans/common-inquiry'

const config: InquiryWidgetConfig = {
  id: 'owlmeans-quote',
  tabs: [{ alias: 'quote', title: { en: 'Get a quote', pl: 'Poproś o wycenę' } }],
  legal: { terms: 'https://owlmeans.com/legal/terms', privacy: 'https://owlmeans.com/legal/privacy' },
}

inquiryConfigHelper.validate(config)               // [] — or English sentences, one per problem
inquiryConfigHelper.tabOf(config, 'quote')         // the tab, else the default, else the first
inquiryConfigHelper.text(config.tabs[0].title, 'pl-PL')   // 'Poproś o wycenę'
inquiryConfigHelper.normalizeLanguage('uk-UA')     // 'uk' — or 'en' when unsupported
```

A CRM route validates the multipart body with `InquirySubmissionSchema` (ajv with
`removeAdditional` and `coerceTypes`), then parses `files` and validates it with
`InquiryFileMetaListSchema`. The file fields are declared as open objects on purpose: any stricter
keyword makes ajv walk the Buffer's bytes.

## Related

- [`@owlmeans/web-inquiry`](../web-inquiry): the browser SDK that loads the widget and reports opens
- [`@owlmeans/web-log`](../web-log): the consent-gated tag-manager plugin the open event reaches

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.53
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
