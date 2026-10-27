import { useEffect, useState } from 'react'

/** The same md boundary as the shell's Tailwind layout, including resize after mount. */
export const useWideNav = (): boolean => {
  const [wide, setWide] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches
  )
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const change = () => setWide(media.matches)
    change()
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  return wide
}
