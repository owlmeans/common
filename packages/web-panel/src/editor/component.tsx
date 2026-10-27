import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import { basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { syntaxHighlighting } from '@codemirror/language'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { linter } from '@codemirror/lint'
import { Braces, Check, Copy, LockKeyhole, WrapText } from 'lucide-react'
import { Button } from '../@/components/ui/button.js'
import { cn } from '../@/lib/utils.js'
import { EDITOR_THEME, JSON_HIGHLIGHT, LABELS } from './consts.local.js'
import type { JsonEditorProps } from './types.js'

export const JsonEditor: FC<JsonEditorProps> = ({
  value,
  onChange,
  onValidityChange,
  readOnly = false,
  id,
  ariaLabel = 'JSON',
  testId,
  className,
  minHeight = 120,
  maxHeight = 560,
  labels
}) => {
  const copy = { ...LABELS, ...labels }
  const errorId = useId()
  const mount = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const callback = useRef(onChange)
  const external = useRef(false)
  const [access] = useState(() => new Compartment())
  const [attributes] = useState(() => new Compartment())
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const error = useMemo(() => {
    try {
      JSON.parse(value)
      return null
    } catch (cause) {
      return cause instanceof Error ? cause.message : String(cause)
    }
  }, [value])
  callback.current = onChange

  useEffect(() => {
    if (mount.current == null) return
    const view = new EditorView({
      parent: mount.current,
      doc: value,
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        EDITOR_THEME,
        syntaxHighlighting(JSON_HIGHLIGHT),
        EditorView.lineWrapping,
        access.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
        attributes.of(EditorView.contentAttributes.of({ 'aria-label': ariaLabel })),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !external.current) callback.current?.(update.state.doc.toString())
        })
      ]
    })
    editor.current = view
    return () => {
      view.destroy()
      editor.current = null
    }
  }, [])

  useEffect(() => {
    const view = editor.current
    if (view == null || view.state.doc.toString() === value) return
    external.current = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    external.current = false
  }, [value])

  useEffect(() => {
    editor.current?.dispatch({
      effects: [
        access.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
        attributes.reconfigure(
          EditorView.contentAttributes.of({
            ...(id != null ? { id } : {}),
            ...(testId != null ? { 'data-testid': testId } : {}),
            'aria-label': ariaLabel,
            'aria-readonly': String(readOnly),
            'aria-invalid': String(error != null),
            ...(error != null ? { 'aria-describedby': errorId } : {})
          })
        )
      ]
    })
  }, [readOnly, id, testId, ariaLabel, error])

  useEffect(() => {
    onValidityChange?.(error == null)
  }, [error, onValidityChange])
  useEffect(() => {
    setCopied(false)
    setCopyFailed(false)
  }, [value])

  const copyText = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div
      data-json-editor
      data-valid={error == null}
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border bg-background text-foreground shadow-xs focus-within:ring-2 focus-within:ring-ring/40',
        error != null && 'border-destructive',
        className
      )}
    >
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1">
        <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <Braces className="size-3.5" aria-hidden="true" />
          JSON
          {readOnly && (
            <span className="inline-flex items-center gap-1 font-sans">
              <LockKeyhole className="size-3" />
              {copy.readOnly}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={error != null}
              onClick={() => onChange?.(JSON.stringify(JSON.parse(value), null, 2))}
            >
              <WrapText className="size-3.5" />
              {copy.format}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => void copyText()}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? copy.copied : copyFailed ? copy.copyFailed : copy.copy}
          </Button>
        </div>
      </div>
      <div
        ref={mount}
        className="[&_.cm-scroller]:max-h-[var(--json-max-height)] [&_.cm-scroller]:min-h-[var(--json-min-height)]"
        style={{ '--json-min-height': `${minHeight}px`, '--json-max-height': `${maxHeight}px` } as React.CSSProperties}
      />
      <div
        className={cn('border-t px-3 py-1.5 text-xs', error != null ? 'text-destructive' : 'text-muted-foreground')}
        aria-live="polite"
        id={errorId}
      >
        {error != null ? `${copy.invalid}: ${error}` : copy.valid}
      </div>
    </div>
  )
}
