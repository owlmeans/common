import type { SxProps, Theme } from '@mui/material/styles'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { BlockScaling } from '@owlmeans/client-panel'

export const scalingToStyles = (
  horizontal?: BlockScaling,
  vertical?: BlockScaling,
  theme?: Theme
): SxProps => {
  const style: SxProps = {}
  switch (horizontal) {
    case BlockScaling.Half:
      Object.assign(style, {
        maxWidth: '50%',
        [theme?.breakpoints.down('md') ?? 'xs']: {
          maxWidth: '90%'
        },
        flexGrow: 1
      })
      break
    case BlockScaling.Wide:
      Object.assign(style, { mx: '10%', flexGrow: 1 })
      break
    case BlockScaling.Full:
      Object.assign(style, { flexGrow: 1 })
      break
  }

  switch (vertical) {
    case BlockScaling.Half:
      Object.assign(style, {
        maxHeight: '50%',
        [theme?.breakpoints.down('md') ?? 'xs']: {
          maxHeight: '90%'
        },
        flexGrow: 1
      })
      break
    case BlockScaling.Wide:
      Object.assign(style, { my: '10%', flexGrow: 1 })
      break
    case BlockScaling.Full:
      Object.assign(style, { height: '100%', flexGrow: 1 })
      break
  }

  return style
}

export const useBreakPoint = () => {
  const theme = useTheme()

  // Define breakpoints
  const isXs = useMediaQuery(theme.breakpoints.only('xs'))
  const isSm = useMediaQuery(theme.breakpoints.only('sm'))
  const isMd = useMediaQuery(theme.breakpoints.only('md'))
  const isLg = useMediaQuery(theme.breakpoints.only('lg'))
  const isXl = useMediaQuery(theme.breakpoints.only('xl'))

  let currentBreakpoint = isXs ? 'xs' : 'unknown' // Default value
  if (isSm) currentBreakpoint = 'sm'
  if (isMd) currentBreakpoint = 'md'
  if (isLg) currentBreakpoint = 'lg'
  if (isXl) currentBreakpoint = 'xl'

  return currentBreakpoint
}

export const useMapBreakpoint = <T>(map: Record<string, T>, def?: T, breakpoint?: string): T => {
  const _breakpoint = useBreakPoint()
  breakpoint = breakpoint ?? _breakpoint
  const result = map[breakpoint] ?? def
  if (result == null) {
    throw new SyntaxError(`Breakpoint should always return value. We have ${breakpoint}, but ${Object.keys(map).join(', ')} are available`)
  }

  return result
}
