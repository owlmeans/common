import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, FC, KeyboardEvent } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
import { cn } from '../../../@/lib/utils.js'
import { pickerColorHelper } from '../../../picker/vocabulary.js'
import type { CustomColorProps } from '../types.local.js'
import {
  CUSTOM_DISC, CUSTOM_PANEL, CUSTOM_ROW, CUSTOM_START, FIELD, FIELD_ERROR, FULL_HEX, HAIRLINE, HEX_FIELD, RAINBOW,
  SWATCH_SELECTED, WHEEL_STYLE,
} from '../consts.local.js'

/**
 * The opt-in custom colour: a row that opens a colour wheel (react-colorful — accessible sliders,
 * touch) and a hex field. The wheel commits as it moves, like a native colour input; the field
 * commits a full `#rrggbb` while typing and a short `#rgb` on Enter or blur, always normalized to
 * lowercase six digits. Anything else marks the field invalid and changes nothing.
 */
export const CustomColor: FC<CustomColorProps> = ({ value, onChange, text }) => {
  const [open, setOpen] = useState(value != null)
  const [draft, setDraft] = useState(value?.key ?? '')
  const [checked, setChecked] = useState(false)
  const typing = useRef(false)
  const panelId = useId()
  const errorId = useId()

  // Follow the committed value, but never under the person's fingers.
  useEffect(() => {
    if (!typing.current) {
      setDraft(value?.key ?? '')
    }
  }, [value?.key])

  const normalized = pickerColorHelper.normalizeHex(draft)
  const invalid = checked && draft.trim() !== '' && normalized == null
  const label = text.text('custom', 'Custom colour')

  const commit = (hex: string): void => {
    if (hex !== value?.key) {
      onChange(hex)
    }
  }

  const onText = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value
    setDraft(next)
    setChecked(false)
    const full = FULL_HEX.test(next.trim()) ? pickerColorHelper.normalizeHex(next) : null
    if (full != null) {
      commit(full)
    }
  }

  const settle = (): void => {
    setChecked(true)
    if (normalized != null) {
      setDraft(normalized)
      commit(normalized)
    }
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      // Never the enclosing form's submit.
      event.preventDefault()
      settle()
    }
  }

  const onWheel = (hex: string): void => {
    setDraft(hex)
    setChecked(false)
    commit(hex)
  }

  return <>
    <button
      type="button" data-picker-color="custom" data-selected={value != null || undefined}
      aria-label={value != null ? `${label}: ${value.label}` : label}
      aria-expanded={open} aria-controls={open ? panelId : undefined}
      onClick={() => setOpen(!open)} className={CUSTOM_ROW}
    >
      <span
        aria-hidden="true"
        style={value != null ? pickerColorHelper.styleOf(value.key) : undefined}
        className={cn(CUSTOM_DISC, HAIRLINE, value != null ? 'bg-(--pick-swatch)' : RAINBOW, value != null && SWATCH_SELECTED)}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value != null && <span className="font-mono text-xs text-muted-foreground">{value.label}</span>}
      <ChevronDownIcon
        aria-hidden="true"
        className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')}
      />
    </button>
    {open && <div id={panelId} className={CUSTOM_PANEL}>
      <HexColorPicker color={normalized ?? value?.key ?? CUSTOM_START} onChange={onWheel} style={WHEEL_STYLE} />
      <input
        data-picker-hex type="text" inputMode="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
        enterKeyHint="done" maxLength={7} placeholder={CUSTOM_START}
        aria-label={text.text('hex', 'Hex colour')} aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        value={draft} onChange={onText} onKeyDown={onKey}
        onFocus={() => { typing.current = true }}
        onBlur={() => { typing.current = false; settle() }}
        className={cn(FIELD, HEX_FIELD)}
      />
      {invalid && <p id={errorId} className={FIELD_ERROR}>{text.text('invalidHex', 'Enter a colour like #3b82f6')}</p>}
    </div>}
  </>
}
