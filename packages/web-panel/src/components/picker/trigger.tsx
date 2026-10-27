import type { FC } from 'react'
import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import { cn } from '../../@/lib/utils.js'
import { pickerColorHelper } from '../../picker/vocabulary.js'
import type { PickerTriggerProps } from './types.local.js'
import { IconTile } from './tile.js'
import {
  CHEVRON, HAIRLINE, TRIGGER_BUTTON, TRIGGER_COMPACT, TRIGGER_DISC, TRIGGER_DOT, TRIGGER_EMPTY,
} from './consts.local.js'

/**
 * What opens a picker: a field-like button (the mark, its names, a chevron) or the mark alone.
 *
 * It is the popover's anchor and stays mounted in one place whichever surface opens, so focus has
 * one element to return to. Its accessible name is the label and the current choice ("Mark:
 * Rocket · Indigo"); it carries `data-picker-trigger`, never `data-slot="button"` or `data-tone`.
 * Extra props — the popover anchor's — land on the button.
 */
export const PickerTrigger: FC<PickerTriggerProps> = ({
  ref, mode, variant, icon, color, colors, text, label, placeholder, open, disabled, id, className, onOpen, ...anchor
}) => {
  const resolved = pickerColorHelper.resolve(color, colors)
  const summary = text.summary(icon, resolved, mode)
  const name = label != null && label !== '' ? `${label}: ${summary ?? placeholder}` : summary ?? placeholder
  const empty = summary == null

  const mark = mode === 'color'
    ? empty
      ? <span aria-hidden="true" className={cn(TRIGGER_EMPTY, 'rounded-full', variant === 'dot' && 'size-5')} />
      : <span
        aria-hidden="true" style={pickerColorHelper.styleOf(color, colors)}
        className={cn(TRIGGER_DISC, HAIRLINE, variant === 'dot' && 'size-5')}
      />
    : empty
      ? <span aria-hidden="true" className={cn(TRIGGER_EMPTY, variant === 'tile' && 'size-full rounded-lg')}><PlusIcon /></span>
      : <IconTile icon={icon} color={color} colors={colors} size={variant === 'tile' ? 'md' : 'sm'} className={variant === 'tile' ? 'size-full' : undefined} />

  return <button
    {...anchor}
    ref={ref} type="button" id={id} disabled={disabled}
    data-picker-trigger={variant} aria-haspopup="dialog" aria-expanded={open} aria-label={name}
    title={variant === 'button' ? undefined : name}
    onClick={onOpen}
    className={cn(
      variant === 'button' ? TRIGGER_BUTTON : TRIGGER_COMPACT, variant === 'dot' && TRIGGER_DOT, className
    )}
  >
    {variant === 'button' && mode === 'color' ? <span className="inline-flex size-7 shrink-0 items-center justify-center">{mark}</span> : mark}
    {variant === 'button' && <>
      <span className={cn('min-w-0 flex-1 truncate', empty && 'text-muted-foreground')}>{summary ?? placeholder}</span>
      <ChevronDownIcon aria-hidden="true" className={CHEVRON} />
    </>}
  </button>
}
