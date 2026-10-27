import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import type { JsonEditorLabels } from './types.js'

export const LABELS: JsonEditorLabels = {
  format: 'Format',
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  readOnly: 'Read only',
  valid: 'Valid JSON',
  invalid: 'Invalid JSON'
}

export const EDITOR_THEME = EditorView.theme({
  '&': {
    backgroundColor: 'var(--background, var(--color-background))',
    color: 'var(--foreground, var(--color-foreground))',
    fontSize: '13px'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, monospace', overflow: 'auto', lineHeight: '1.7' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--foreground, var(--color-foreground))' },
  '.cm-line': { padding: '0 16px 0 10px' },
  '.cm-gutters': {
    backgroundColor: 'var(--muted, var(--color-muted))',
    color: 'var(--muted-foreground, var(--color-muted-foreground))',
    borderRight: '1px solid var(--border, var(--color-border))'
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--accent, var(--color-accent))' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--accent, var(--color-accent))'
  },
  '.cm-cursor': { borderLeftColor: 'var(--foreground, var(--color-foreground))' },
  '.cm-foldPlaceholder, .cm-tooltip': {
    backgroundColor: 'var(--popover, var(--color-popover))',
    color: 'var(--popover-foreground, var(--color-popover-foreground))',
    border: '1px solid var(--border, var(--color-border))'
  },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--accent, var(--color-accent))',
    outline: '1px solid var(--ring, var(--color-ring))'
  }
})

export const JSON_HIGHLIGHT = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--primary-bright, var(--color-primary))', fontWeight: '600' },
  { tag: tags.string, color: 'var(--foreground, var(--color-foreground))' },
  {
    tag: tags.number,
    color: 'color-mix(in oklch, var(--chart-3, var(--color-primary)), var(--foreground, var(--color-foreground)) 30%)'
  },
  {
    tag: tags.bool,
    color:
      'color-mix(in oklch, var(--secondary, var(--color-primary)), var(--foreground, var(--color-foreground)) 20%)',
    fontWeight: '600'
  },
  { tag: tags.null, color: 'var(--muted-foreground, var(--color-muted-foreground))', fontStyle: 'italic' },
  { tag: tags.punctuation, color: 'var(--muted-foreground, var(--color-muted-foreground))' }
])
