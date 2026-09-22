import { useCallback, useEffect, useState } from 'react'
import {
  COLOR_SCHEME_EVENT, COLOR_SCHEME_KEY, applyColorScheme, readColorScheme, setColorSchemeClass,
} from '../../scheme/scheme.js'
import type { ColorSchemeChoice } from '../../scheme/scheme.js'
import type { ColorSchemeModel } from './types.js'

const DARK_QUERY = '(prefers-color-scheme: dark)'

const systemDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(DARK_QUERY).matches

/**
 * The page's colour scheme, and the way to choose one.
 *
 * Both halves are read synchronously on the first render — the stored choice from storage, the
 * system preference from `matchMedia` — so a toggle never renders the wrong icon for a frame.
 * Afterwards it follows three sources: `applyColorScheme` anywhere in this document (its event),
 * another tab changing the stored key (`storage`), and the operating system switching while no
 * choice is stored.
 *
 * Mounting also re-applies a stored choice's class. The head bootstrap has normally done that
 * before the first paint; an application without it still ends up on the right scheme, one frame
 * late rather than never.
 */
export const useColorScheme = (): ColorSchemeModel => {
  const [choice, setState] = useState<ColorSchemeChoice | null>(readColorScheme)
  const [dark, setDark] = useState<boolean>(systemDark)

  useEffect(() => {
    const stored = readColorScheme()
    if (stored != null) {
      setColorSchemeClass(stored)
    }
    setState(stored)

    const onChoice = () => setState(readColorScheme())
    const onStorage = (event: StorageEvent) => {
      if (event.key === COLOR_SCHEME_KEY || event.key == null) {
        const next = readColorScheme()
        setColorSchemeClass(next)
        setState(next)
      }
    }
    window.addEventListener(COLOR_SCHEME_EVENT, onChoice)
    window.addEventListener('storage', onStorage)

    const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
    const onSystem = () => setDark(media?.matches === true)
    media?.addEventListener('change', onSystem)
    onSystem()

    return () => {
      window.removeEventListener(COLOR_SCHEME_EVENT, onChoice)
      window.removeEventListener('storage', onStorage)
      media?.removeEventListener('change', onSystem)
    }
  }, [])

  const setChoice = useCallback((next: ColorSchemeChoice | null) => applyColorScheme(next), [])

  return { scheme: choice ?? (dark ? 'dark' : 'light'), choice, setChoice }
}
