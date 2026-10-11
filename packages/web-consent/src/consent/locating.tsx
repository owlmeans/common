import { useEffect, useState, type FC } from 'react'
import { LoaderCircle } from 'lucide-react'
import { CONSENT_LOCATING_DELAY } from './consts.local.js'
import type { ConsentLocatingProps } from './types.local.js'

/**
 * While the visitor's country is being found: a transparent overlay — the
 * page stays in sight and out of reach — with a spinner and no bar. The spinner itself waits
 * `CONSENT_LOCATING_DELAY`, so an answer from the edge in a few milliseconds flashes nothing; the
 * status text is there from the start for assistive technology.
 */
export const ConsentLocatingOverlay: FC<ConsentLocatingProps> = ({ t }) => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), CONSENT_LOCATING_DELAY)

    return () => clearTimeout(timer)
  }, [])

  return <div
    className="fixed inset-0 z-[999998] flex items-center justify-center bg-transparent"
    role="status" aria-live="polite" data-consent-overlay data-consent-locating="first"
  >
    <span className="sr-only">{t('locating', 'Checking your region…')}</span>
    {visible && <LoaderCircle
      className="h-8 w-8 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" data-consent-spinner
    />}
  </div>
}
