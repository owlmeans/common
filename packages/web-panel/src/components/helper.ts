import type { SxProps } from '@mui/material/styles'
import useTheme from '@mui/material/styles/useTheme'
import useMediaQuery from '@mui/material/useMediaQuery'
import { BlockScaling } from '@owlmeans/client-panel'

export const scalingToStyles = (scaling?: BlockScaling): SxProps => {
  switch (scaling) {
    case BlockScaling.Half:
      return { maxWidth: '50%', flexGrow: 1 }
    case BlockScaling.Wide:
      return { mx: '10%', flexGrow: 1 }
    case BlockScaling.Full:
      return { flexGrow: 1 }
  }

  return {}
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
