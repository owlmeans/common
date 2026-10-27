import type { FC } from 'react'
import type { IconPickerProps } from './types.js'
import { PickerRoot } from './root.js'

/**
 * The icon half alone: a trigger opening the searchable, categorized grid (tinted in `color`).
 * Commits a kebab-case lucide name on click and closes.
 */
export const IconPicker: FC<IconPickerProps> = ({ value, onChange, color, trigger = 'button', ...base }) =>
  <PickerRoot
    {...base} mode="icon" trigger={trigger} closeOnPick icon={value} color={color}
    onIcon={onChange} onColor={() => undefined}
  />
