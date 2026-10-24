import { useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import { PICKER_COLORS } from '../../picker/vocabulary/consts.js'
import type { PickerRootProps } from './types.local.js'
import { PickerPanel } from './panel.js'
import { PickerSurface } from './surface.js'
import { PickerTrigger } from './trigger.js'
import { makePickerText } from './text.js'
import { FINE_POINTER_QUERY, POPOVER_QUERY } from './consts.local.js'

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches

/**
 * The state every picker shares: open or closed, and on which surface.
 *
 * `surface="auto"` is decided when the picker OPENS — a popover from 768px up, a sheet below — and
 * kept until it closes, so a resize or an on-screen keyboard never swaps the surface under the
 * person's finger. Picks commit at once through `onIcon` / `onColor`; a single-purpose picker then
 * closes, the composite stays open for its other half. On open, a fine pointer lands in the search
 * field; anything else on the selected cell (no keyboard pops up on a phone).
 */
export const PickerRoot: FC<PickerRootProps> = ({
  mode, icon, color, onIcon, onColor, colors = PICKER_COLORS, icons, customColors = false, trigger, closeOnPick,
  label, placeholder, disabled, surface = 'auto', translate, className, id,
}) => {
  const text = useMemo(() => makePickerText(translate), [translate])
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'popover' | 'sheet'>('popover')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const title = label != null && label !== ''
    ? label
    : mode === 'both' ? text.text('label', 'Icon and colour')
      : mode === 'icon' ? text.text('icon', 'Icon') : text.text('color', 'Colour')
  const hint = placeholder ?? (
    mode === 'both' ? text.text('placeholder.both', 'Choose icon and colour')
      : mode === 'icon' ? text.text('placeholder.icon', 'Choose an icon') : text.text('placeholder.color', 'Choose a colour')
  )

  const show = (): void => {
    if (disabled === true) {
      return
    }
    setKind(surface === 'auto' ? (matches(POPOVER_QUERY) ? 'popover' : 'sheet') : surface)
    setOpen(true)
  }

  const picked = (apply: (value: string) => void) => (value: string): void => {
    apply(value)
    if (closeOnPick) {
      setOpen(false)
    }
  }

  const onOpenFocus = (content: HTMLElement): void => {
    const search = searchRef.current
    if (search != null && matches(FINE_POINTER_QUERY)) {
      search.focus()

      return
    }
    ;(content.querySelector<HTMLElement>('[data-roving-item][tabindex="0"]') ?? content).focus()
  }

  return <PickerSurface
    open={open} onOpenChange={setOpen} kind={kind} tall={mode !== 'color'} title={title}
    onOpenFocus={onOpenFocus} onCloseFocus={() => triggerRef.current?.focus()}
    anchor={<PickerTrigger
      ref={triggerRef} mode={mode} variant={trigger} icon={icon} color={color} colors={colors} text={text}
      label={label} placeholder={hint} open={open} disabled={disabled} id={id} className={className} onOpen={show}
    />}
  >
    <PickerPanel
      mode={mode} icon={icon} color={color} onIcon={picked(onIcon)} onColor={picked(onColor)} onCustomColor={onColor}
      colors={colors} icons={icons} customColors={customColors} text={text} layout={kind} title={title}
      onDone={kind === 'sheet' ? () => setOpen(false) : undefined} searchRef={searchRef}
    />
  </PickerSurface>
}
