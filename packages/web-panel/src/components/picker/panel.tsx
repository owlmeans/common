import type { FC } from 'react'
import { PlusIcon } from 'lucide-react'
import { cn } from '../../@/lib/utils.js'
import { pickerColorHelper } from '../../picker/vocabulary.js'
import type { PickerPanelProps } from './types.local.js'
import { IconBrowser } from './grid.js'
import { SwatchGrid } from './swatches.js'
import { IconTile } from './tile.js'
import {
  BODY, DONE, HAIRLINE, HEADER, HEADER_SUMMARY, HEADER_TITLE, ICON_GRID_PAD, SECTION, SECTION_TITLE, TRIGGER_EMPTY,
} from './consts.local.js'

/**
 * A picker's content: a preview header (the mark as it will render, the title, the current choice
 * — and on the sheet a 44px Done button), then the swatches and the icon grid, scrolling between a
 * fixed header and the surface's edge.
 */
export const PickerPanel: FC<PickerPanelProps> = ({
  mode, icon, color, onIcon, onColor, onCustomColor, colors, icons, customColors, text, layout, title, onDone, searchRef,
}) => {
  const resolved = pickerColorHelper.resolve(color, colors)
  const summary = text.summary(icon, resolved, mode) ?? text.text('nothing', 'Nothing chosen yet')

  return <div data-picker-panel className="flex min-h-0 flex-1 flex-col">
    <div className={HEADER[layout]}>
      {mode === 'color'
        ? <span
          aria-hidden="true" style={pickerColorHelper.styleOf(color, colors)}
          className={cn('size-12 shrink-0 rounded-full bg-(--pick-swatch)', HAIRLINE, resolved == null && 'opacity-40')}
        />
        : (icon == null || icon === '') && resolved == null
          ? <span aria-hidden="true" className={cn(TRIGGER_EMPTY, 'size-12 rounded-xl [&>svg]:size-5')}><PlusIcon /></span>
          : <IconTile icon={icon} color={color} colors={colors} size="lg" />}
      <div className="min-w-0 flex-1">
        <p aria-hidden="true" className={HEADER_TITLE}>{title}</p>
        <p data-picker-summary className={HEADER_SUMMARY}>{summary}</p>
      </div>
      {onDone != null && <button
        type="button" data-picker-done aria-label={text.text('done', 'Done')} onClick={onDone} className={DONE}
      >
        {text.text('done', 'Done')}
      </button>}
    </div>
    <div data-picker-scroll className={BODY}>
      {mode !== 'icon' && <section className={cn(SECTION[layout], mode === 'color' && ICON_GRID_PAD[layout])}>
        {mode === 'both' && <h3 className={SECTION_TITLE}>{text.text('color', 'Colour')}</h3>}
        <SwatchGrid
          value={color} onChange={onColor} onCustomChange={onCustomColor} colors={colors} customColors={customColors}
          text={text} layout={layout} label={text.text('color', 'Colour')}
        />
      </section>}
      {mode !== 'color' && <section className={cn(SECTION[layout], ICON_GRID_PAD[layout])}>
        {mode === 'both' && <h3 className={SECTION_TITLE}>{text.text('icon', 'Icon')}</h3>}
        <IconBrowser
          value={icon} onChange={onIcon} color={color} colors={colors} icons={icons} text={text} layout={layout}
          label={text.text('icon', 'Icon')} searchRef={searchRef}
        />
      </section>}
    </div>
  </div>
}
