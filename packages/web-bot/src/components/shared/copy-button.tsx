import { useCallback, useState, type FC } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import { Check, Copy } from 'lucide-react'
import { Button } from '../../@/components/ui/button.js'
import { BOT_I18N } from '../../consts.js'
import type { CopyButtonProps } from './types.js'

/**
 * Copies one value to the clipboard. A refused or missing clipboard (an insecure origin, a denied
 * permission) is not reported: the value is on screen and selectable, and the button simply does
 * not claim a copy it did not make.
 */
export const CopyButton: FC<CopyButtonProps> = ({ value, label, what }) => {
  const t = useI18nLib(BOT_I18N, 'common')
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }, [value])

  return <Button
    type="button" variant="outline" size="sm" data-bot-action="copy" data-bot-copy={what}
    aria-label={`${t(copied ? 'copied' : 'copy')}: ${label}`}
    onClick={() => { void copy() }}
  >
    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    {t(copied ? 'copied' : 'copy')}
  </Button>
}
