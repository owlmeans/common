import { useMemo, useRef, useState } from 'react'
import type { FC, KeyboardEvent } from 'react'
import { SearchIcon, SearchXIcon } from 'lucide-react'
import { cn } from '../../@/lib/utils.js'
import { pickerIconHelper } from '../../picker/icons.js'
import { pickerColorHelper } from '../../picker/vocabulary.js'
import { PICKER_COLORS, PICKER_ICON_CATEGORIES } from '../../picker/vocabulary/consts.js'
import type { PickerIconCategory } from '../../picker/vocabulary/types.js'
import type { IconGridProps } from './types.js'
import type { IconBrowserProps } from './types.local.js'
import { useRovingGrid } from './roving.js'
import { makePickerText } from './text.js'
import {
  CHIP, CHIPS, EMPTY, FIELD, ICON_CELL, ICON_TOOLS, ICONS, LINK_BUTTON, PICK_SCOPE, SEARCH, SEARCH_ICON, SEARCH_WRAP,
} from './consts.local.js'

/**
 * The searchable icon grid every picker shares: a search field, category chips and the icons,
 * tinted in the chosen colour. The search field and the chips stay put while the grid scrolls;
 * ArrowDown (or Enter) moves from the field into the grid, ArrowUp from the grid's first row back.
 * An empty result says so and offers to clear; the result count is announced politely.
 */
export const IconBrowser: FC<IconBrowserProps> = (
  { value, onChange, color, colors, icons, text, layout, label, searchRef, className }
) => {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PickerIconCategory | null>(null)
  const search = useRef<HTMLInputElement | null>(null)

  const categories = useMemo(() => {
    const scope = pickerIconHelper.search('', icons)

    return PICKER_ICON_CATEGORIES.filter(candidate => scope.some(entry => entry.category === candidate))
  }, [icons])
  const results = useMemo(
    () => pickerIconHelper.search(query, icons).filter(entry => category == null || entry.category === category),
    [query, icons, category]
  )

  const grid = useRovingGrid({
    count: results.length,
    selected: results.findIndex(entry => entry.name === value),
    onExitUp: () => search.current?.focus(),
  })
  const chips = useRovingGrid({
    count: categories.length + 1,
    selected: category == null ? 0 : categories.indexOf(category) + 1,
    grid: false,
  })

  const bindSearch = (node: HTMLInputElement | null): void => {
    search.current = node
    if (typeof searchRef === 'function') {
      searchRef(node)
    } else if (searchRef != null) {
      searchRef.current = node
    }
  }

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      // Enter must never submit the form the grid sits in.
      event.preventDefault()
      grid.focusCurrent()
    }
  }

  const filtered = query.trim() !== '' || category != null

  return <div
    data-picker-icons style={pickerColorHelper.styleOf(color, colors)} className={cn(PICK_SCOPE, className)}
  >
    <div className={ICON_TOOLS[layout]}>
      <div className={SEARCH_WRAP}>
        <SearchIcon aria-hidden="true" className={SEARCH_ICON} />
        <input
          ref={bindSearch} type="search" data-picker-search autoComplete="off" spellCheck={false} enterKeyHint="search"
          aria-label={text.text('search', 'Search icons')} placeholder={text.text('searchPlaceholder', 'Search icons…')}
          value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onSearchKey}
          className={cn(FIELD, SEARCH)}
        />
      </div>
      {categories.length > 1 && <div
        ref={chips.ref} role="group" aria-label={text.text('categoriesLabel', 'Categories')} onKeyDown={chips.onKeyDown}
        className={CHIPS[layout]}
      >
        {[null, ...categories].map((candidate, index) => {
          const name = candidate == null ? text.text('all', 'All') : text.category(candidate)

          return <button
            key={candidate ?? 'all'} type="button" data-roving-item data-picker-category={candidate ?? 'all'}
            aria-label={name} aria-pressed={category === candidate} tabIndex={chips.tabIndexOf(index)}
            onFocus={() => chips.setCurrent(index)} onClick={() => setCategory(candidate)} className={CHIP}
          >{name}</button>
        })}
      </div>}
    </div>
    <p className="sr-only" aria-live="polite">{filtered ? text.count(results.length) : ''}</p>
    {results.length > 0
      ? <div ref={grid.ref} role="group" aria-label={label} onKeyDown={grid.onKeyDown} className={ICONS[layout]}>
        {results.map((entry, index) => {
          const Icon = pickerIconHelper.iconOf(entry.name)
          const name = text.icon(entry.name)

          return <button
            key={entry.name} type="button" data-roving-item data-picker-icon={entry.name}
            aria-label={name} aria-pressed={entry.name === value} title={name}
            tabIndex={grid.tabIndexOf(index)} onFocus={() => grid.setCurrent(index)}
            onClick={() => onChange(entry.name)} className={ICON_CELL}
          ><Icon aria-hidden="true" /></button>
        })}
      </div>
      : <div data-picker-empty className={EMPTY}>
        <SearchXIcon aria-hidden="true" className="size-6" />
        <p>{text.empty(query.trim())}</p>
        <button
          type="button" aria-label={text.text('clear', 'Clear search')} className={LINK_BUTTON}
          onClick={() => { setQuery(''); setCategory(null); search.current?.focus() }}
        >{text.text('clear', 'Clear search')}</button>
      </div>}
  </div>
}

/**
 * The searchable icon grid inline — for a dialog or sheet the application already owns. Commits
 * on click; `color` tints it, `icons` narrows (and orders) the catalogue. Strings through
 * `translate` (English without it — never an implicit i18n read).
 */
export const IconGrid: FC<IconGridProps> = (
  { value, onChange, color, colors = PICKER_COLORS, icons, translate, label, className }
) => {
  const text = useMemo(() => makePickerText(translate), [translate])

  return <IconBrowser
    value={value} onChange={onChange} color={color} colors={colors} icons={icons} text={text} layout="inline"
    label={label ?? text.text('icon', 'Icon')} className={className}
  />
}
