import { useEffect, useState } from 'react'
import { BlockScaling } from '@owlmeans/client-panel'
import { BREAKPOINTS } from './consts.local.js'

/**
 * Map MUI's previous `scalingToStyles(horizontal, vertical, theme): SxProps`
 * to a Tailwind utility class composition string. Consumers compose this
 * with their own classes via `cn()` or template literals.
 *
 * Breakpoint semantics mirror the old MUI implementation:
 *   - Half:  capped width/height on >=md, expanded on <md, `flex-grow: 1`
 *   - Wide:  10% horizontal/vertical margin, `flex-grow: 1`
 *   - Full:  fill axis, `flex-grow: 1`
 */
export const scalingToStyles = (
  horizontal?: BlockScaling,
  vertical?: BlockScaling
): string => {
  const parts: string[] = []

  switch (horizontal) {
    case BlockScaling.Half:
      parts.push('max-w-[90%]', 'md:max-w-[50%]', 'grow')
      break
    case BlockScaling.Wide:
      parts.push('mx-[10%]', 'grow')
      break
    case BlockScaling.Full:
      parts.push('grow')
      break
  }

  switch (vertical) {
    case BlockScaling.Half:
      parts.push('max-h-[90%]', 'md:max-h-[50%]', 'grow')
      break
    case BlockScaling.Wide:
      parts.push('my-[10%]', 'grow')
      break
    case BlockScaling.Full:
      parts.push('h-full', 'grow')
      break
  }

  return parts.join(' ')
}

const matchBreakpoint = (width: number): string => {
  for (const bp of BREAKPOINTS) {
    if (width >= bp.min && width <= bp.max) {
      return bp.name
    }
  }
  return 'xs'
}

export const useBreakPoint = (): string => {
  const [bp, setBp] = useState<string>(() =>
    typeof window === 'undefined' ? 'lg' : matchBreakpoint(window.innerWidth)
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setBp(matchBreakpoint(window.innerWidth))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return bp
}

export const useMapBreakpoint = <T>(map: Record<string, T>, def?: T, breakpoint?: string): T => {
  const _breakpoint = useBreakPoint()
  breakpoint = breakpoint ?? _breakpoint
  const result = map[breakpoint] ?? def
  if (result == null) {
    throw new SyntaxError(`Breakpoint should always return value. We have ${breakpoint}, but ${Object.keys(map).join(', ')} are available`)
  }
  return result as T
}
