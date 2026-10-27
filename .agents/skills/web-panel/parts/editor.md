---
name: editor
description: Controlled JSON editing and previews with the optional web-panel/editor entrypoint, CodeMirror 6, syntax diagnostics, formatting, copying and read-only state.
metadata:
  purposes: form, view
  mentions: JsonEditor, JsonEditorProps, JsonEditorLabels
---

# JSON editor

Import `JsonEditor` and its `JsonEditorProps` / `JsonEditorLabels` from
`@owlmeans/web-panel/editor`. The root entrypoint does not import the editor, keeping CodeMirror
out of consumers that do not use it. JSON support, linting and highlighting are package dependencies.

```tsx
<JsonEditor
  key={record.id}
  value={draft}
  onChange={setDraft}
  onValidityChange={setValid}
  ariaLabel="Record JSON"
  testId="record-json"
/>
```

- `value` is always raw text. Preserve incomplete drafts; parse at the host's save boundary.
  `onValidityChange` reports syntax validity so a host can disable its save action.
- A change of document identity keys/remounts the component; an update within the same document
  preserves undo history. External controlled values update the view without echoing `onChange`.
- `readOnly` disables editing and removes Format; Copy remains available. Use it for previews and
  inspectors. Formatting pretty-prints valid JSON without changing its values.
- `id`, `testId` and `ariaLabel` address the editable content, including `aria-readonly`,
  `aria-invalid` and its diagnostic description. The wrapper exposes `data-json-editor` and
  `data-valid`. Pass `minHeight` / `maxHeight` in pixels when the host needs another viewport size.
- `labels` overrides format/copy/copied/copyFailed/readOnly/valid/invalid copy. Components do not
  read an implicit i18n provider; defaults are English.
- Colours use host shadcn variables, falling back to Tailwind's `--color-*` variables. Brand-specific
  primary/chart colours have standard-token fallbacks. The host still scans web-panel's `src`.

Acceptance: `@owlmeans/web-panel`'s `editor.spec.ts` (`bun test tests/editor.spec.ts` in the package); the real Chromium harness checks
highlighting, formatting, undo, incomplete drafts, validity, external values and read-only controls.

## External docs

- https://github.com/codemirror/lang-json — `json()` language support and `jsonParseLinter()` diagnostics for CodeMirror 6.
- https://codemirror.net/docs/ref/ — editor state/view extensions, controlled transactions and read-only configuration.
