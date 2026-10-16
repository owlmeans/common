import type { FC } from 'react'
import type { IconColorPickerProps } from './types.js'
import { PickerRoot } from './root.js'

const present = (value: string | null | undefined): string | undefined =>
  value != null && value !== '' ? value : undefined

/**
 * The composite icon + colour picker — the standard editor of a mark a person chooses (a type's,
 * a flow's, a label's). One trigger opens both halves: 24 swatches (plus a colour wheel and a hex
 * field with `customColors`) and a searchable, categorized icon grid tinted in the chosen colour.
 *
 * Every pick commits at once: `onChange({ icon, color })` carries both halves as they now stand —
 * a palette key or `#rrggbb`, a kebab-case lucide name; a half never chosen stays `undefined`. It
 * opens as a popover from 768px up and as a bottom sheet below (`surface`), and stays open until
 * Esc, a click outside or (on the sheet) Done.
 */
export const IconColorPicker: FC<IconColorPickerProps> = (
  { value, onChange, trigger = 'button', customColors = false, ...base }
) => <PickerRoot
  {...base} mode="both" trigger={trigger} customColors={customColors} closeOnPick={false}
  icon={value?.icon} color={value?.color}
  onIcon={icon => onChange({ icon, color: present(value?.color) })}
  onColor={color => onChange({ icon: present(value?.icon), color })}
/>
