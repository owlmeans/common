import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { RovingGrid, RovingGridOptions } from './types.local.js'

/** What marks a roving item inside the container. */
const ITEM = '[data-roving-item]'

/**
 * Arrow-key focus across the buttons of a grid (or one row): a single tab stop, the arrows move
 * within it — Left/Right along, Up/Down a whole row (counted from the layout, so it follows
 * whatever the CSS grid wrapped to), Home/End to the ends. Enter and Space are the buttons' own.
 */
export const useRovingGrid = ({ count, selected, onExitUp, grid = true }: RovingGridOptions): RovingGrid => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [current, setCurrent] = useState<number | null>(null)
  const active = Math.min(Math.max(current ?? selected, 0), Math.max(count - 1, 0))

  const items = (): HTMLElement[] => Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])

  const columnsOf = (list: HTMLElement[]): number => {
    const top = list[0]?.offsetTop
    const first = list.findIndex(item => item.offsetTop !== top)

    return first < 0 ? list.length : Math.max(first, 1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return
    }
    const list = items()
    const from = list.indexOf(event.target as HTMLElement)
    if (from < 0) {
      return
    }
    const columns = grid ? columnsOf(list) : list.length
    const step: Record<string, number> = {
      ArrowRight: 1, ArrowLeft: -1, ...(grid ? { ArrowDown: columns, ArrowUp: -columns } : {}),
    }
    let to: number
    if (event.key === 'Home') {
      to = 0
    } else if (event.key === 'End') {
      to = list.length - 1
    } else if (event.key in step) {
      to = from + step[event.key]
      if (event.key === 'ArrowUp' && to < 0 && onExitUp != null) {
        event.preventDefault()
        onExitUp()

        return
      }
      to = Math.min(Math.max(to, 0), list.length - 1)
    } else {
      return
    }
    event.preventDefault()
    setCurrent(to)
    list[to]?.focus()
  }

  const tabIndexOf = (index: number): number => index === active ? 0 : -1

  const focusCurrent = useCallback(() => {
    const list = items()
    ;(list.find(item => item.tabIndex === 0) ?? list[0])?.focus()
  }, [])

  return { ref, onKeyDown, tabIndexOf, setCurrent, focusCurrent }
}
