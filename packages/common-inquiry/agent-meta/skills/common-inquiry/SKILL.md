---
name: common-inquiry
description: How to use @owlmeans/common-inquiry — the runtime-free contract of the OwlMeans customer inquiry widget (a contact dialog a host page opens, mailed on by a CRM service). Covers the widget config and its tabs, the window runtime contract (INQUIRY_GLOBAL, INQUIRY_RUNTIME_VERSION, configure/open/button/unmount, one onOpen per open), the multipart submission and its file fields, the size/type/text limits, the JSON schemas and inquiryConfigHelper (text, validate, tabOf, normalizeLanguage). Auto-invoked when building the widget bundle, a CRM inquiry route, or a host's widget config, or when importing any INQUIRY_* constant, Inquiry* type or schema. Not the agent's ask-a-person inquiry (that is the `inquiry` skill).
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/common-inquiry

**Layer:** Cross-cutting domain (no `@owlmeans/*` dependencies; optional `ajv` peer for schema types)
**Install:** `"@owlmeans/common-inquiry": "^0.1.18-rc.1"` in `dependencies`

The one place the three parties of the inquiry widget agree: the browser SDK
(`@owlmeans/web-inquiry`), the widget bundle that renders the dialog, and the CRM API that accepts
the submission. Constants, types, JSON schemas and one pure helper — no React, no DOM, nothing that
runs on import.

## Addresses

A CRM is addressed by its base URL (`https://<web host>/crm`, no trailing slash):

| Constant | Value | Full address |
|---|---|---|
| `INQUIRY_SCRIPT` | `inquiry.js` | `<crm>/inquiry.js?v=<INQUIRY_RUNTIME_VERSION>` — the widget bundle |
| `INQUIRY_API_SEGMENT` | `api` | `<crm>/api` — the CRM API |
| `INQUIRY_CONFIG_PATH` | `/assets/config.json` | `<crm>/api/assets/config.json` — the advertised config (reCAPTCHA site key) |
| `INQUIRY_SUBMIT_PATH` | `/inquiry` | `POST <crm>/api/inquiry` — multipart |
| `INQUIRY_RECAPTCHA_ACTION` | `inquiry` | the reCAPTCHA v3 action the widget executes and the CRM requires |
| `INQUIRY_OPEN_EVENT` | `inquiry_dialog_open` | the analytics event of an open |

## The widget config

```ts
const config: InquiryWidgetConfig = {
  id: 'viable',                                   // INQUIRY_ALIAS_PATTERN: ^[a-z0-9][a-z0-9-]{0,31}$
  tabs: [
    { alias: 'report-issue', title: { en: 'Report an issue', pl: 'Zgłoś problem' } },
    { alias: 'ask-question', title: 'Ask a question', description: 'We answer within a day.' },
  ],
  defaultTab: 'report-issue',                     // optional; default: the first tab
  legal: { terms: 'https://…/terms', privacy: '/legal/privacy' },
  language: 'pl',                                 // optional; default: the runtime's, then the document's
}
```

- **One tab renders without a tab strip** — the dialog is that single intent. A site that opens a
  dialog per intent (a "Get a quote" button, a "Book a session" button) gives each its own one-tab
  config with its own `id`.
- `LocalizedText` is a string or a `{ language: string }` map; `inquiryConfigHelper.text` reads it
  with the fallback chain exact tag → primary subtag → `en` → first entry.
- Legal links are absolute http(s) URLs or root-relative paths; a widget resolves a relative one
  against the host page and submits the absolute form (`terms`, `privacy`).
- Caps: 1–`INQUIRY_MAX_TABS` (12) tabs, title ≤ `INQUIRY_TITLE_MAX` (120), description ≤
  `INQUIRY_DESCRIPTION_MAX` (600) per language.

`inquiryConfigHelper.validate(config)` returns every problem as an English sentence (`[]` when
usable): the id and aliases against the pattern, alias uniqueness, non-empty titles, `defaultTab`
naming a tab, the legal links. `InquiryWidgetConfigSchema` checks the structure only — uniqueness
and `defaultTab` membership are the helper's.

## The runtime contract

The bundle installs an `InquiryRuntime` at `window[INQUIRY_GLOBAL]` (`window.__owlmeansInquiry`):

| Member | Contract |
|---|---|
| `version` | `INQUIRY_RUNTIME_VERSION`; a client refuses another. Bump it only for an incompatible change |
| `configure(options)` | page-wide `{ url, language?, onOpen? }`, last call wins; `language` may be a function read at every open |
| `open(config, opts?)` | mount the widget's dialog on first use, open it on `opts.tab` or the default tab; apply `opts.email` when supplied |
| `button(config, opts?)` | mount a floating button (`position`, `offset`, `label`, `source` — default `fab`, `email`); returns an `InquiryHandle` (`open`, `update`, `unmount`); a second call for the same id updates it |
| `unmount(id?)` | remove one widget, or all |

**`onOpen` is called exactly once per dialog open**, whatever opened it — `open`, a handle's
`open`, the floating button — with `{ widget, tab, source }`. Opening a dialog that is already open
does not call it again. The SDK reports analytics from this callback only, so a runtime that also
reported from elsewhere would double-count.

`InquiryEmailOptions.email` is an optional `InquiryEmailPreset`: a string or a lazy function
returning `InquiryEmailValue` (`string | null | undefined`), synchronously or in a Promise. The
runtime resolves it on each closed-to-open transition and replaces any manually edited address;
calling `open` on an already open dialog does not resolve it again. A null/undefined result or a
provider failure clears the address for manual entry. Omitting the option preserves the manual
draft. A button's provider also applies to its floating trigger and handle's `open`; an explicit
open option overrides it.

While a Promise is pending, the address is empty, its field and Send are disabled, and a spinner
beside the field announces loading. Other fields remain editable. Closing, reopening or unmounting
invalidates earlier pending results. A synchronous result needs no spinner. The host owns caching;
the runtime does not fetch identity or persist addresses. These optional options keep runtime
version 1 compatible with clients that omit them.

## The submission

One multipart POST. A multipart parser with `attachFieldsToBody: 'keyValues'` hands every text
field over as a string and every file as a Buffer:

| Field | Rule |
|---|---|
| `widget`, `tab` | alias pattern; required |
| `email` | ≤ `INQUIRY_EMAIL_MAX` (254), `format: email`; required |
| `subject` | 1–`INQUIRY_SUBJECT_MAX` (150); required |
| `contactMethod` | `InquiryContactMethod`: `email`, `phone`, `messenger`, `video`; required |
| `contactDetail` | ≤ `INQUIRY_DETAIL_MAX` (100); the number, handle or time the method needs |
| `body` | 1–`INQUIRY_BODY_MAX` (5000); required |
| `consent` | `true` or `'true'` only; required |
| `files` | JSON string of `InquiryFileMeta[]` (`'[]'` without attachments); required |
| `tabTitle`, `language`, `page`, `terms`, `privacy` | optional context for the mail |
| `file0` … `file4` | the bytes, in the fields `files` names |

`InquirySubmissionSchema` is written for ajv with `removeAdditional` + `coerceTypes`. The file
fields are declared as `{ type: 'object', additionalProperties: true }` and nothing else: any
`properties`, `additionalProperties: false` or size keyword makes ajv walk the Buffer (or strip its
bytes). The handler parses `files` and validates it with `InquiryFileMetaListSchema` (known field,
allowed type, size ≤ the per-file cap, at most five), then checks that each named field is present.

## Limits

| Constant | Value |
|---|---|
| `INQUIRY_MAX_FILE_BYTES` | 5 000 000 (decimal) |
| `INQUIRY_MAX_TOTAL_BYTES` | 20 000 000 |
| `INQUIRY_MAX_FILES` | 5 (`INQUIRY_FILE_FIELDS` = `file0` … `file4`) |
| `INQUIRY_ALLOWED_TYPES` | `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/csv`, `text/plain` — never SVG |
| `INQUIRY_TYPE_EXTENSIONS` | per type, lower case, first canonical (`jpg`/`jpeg`, `txt`/`log`) |

Declared types are claims: the CRM re-detects the type from the bytes and refuses a mismatch, so a
widget's client-side check is a convenience, never the gate.

## Languages

`INQUIRY_LANGUAGES` (`en pl ru be uk es de fr`) is what the widget ships strings for;
`inquiryConfigHelper.normalizeLanguage(tag)` maps any tag to its primary subtag when supported,
else `en`.

## Related

- `web-inquiry` — the browser SDK over this contract (load, open, bind, button, analytics)
- `web-log` — `gtmAnalyticsPlugin`, which carries the open event to a tag manager
