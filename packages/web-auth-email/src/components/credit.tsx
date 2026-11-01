import type { FC } from 'react'
import { useContext } from '@owlmeans/client'
import { resolveCredit } from '@owlmeans/client-auth/login'
import type { CommonConfig } from '@owlmeans/config'
import { cn } from '../@/lib/utils.js'
import { OWLMEANS_URL } from '../consts.js'
import type { EmailLoginCreditProps } from './types.js'

/** The chooser card's bottom line, composed from the same configuration (`login.credit`, `brand`). */
export const EmailLoginCredit: FC<EmailLoginCreditProps> = ({ t, className }) => {
  const ctx = useContext()
  const cfg = ctx.cfg as CommonConfig
  const credit = resolveCredit(cfg.security?.auth?.login?.credit, cfg.brand, ctx.cfg.service)
  if (!credit.poweredBy && credit.line == null) {
    return null
  }

  return <p data-email-login-credit className={cn('text-center text-xs text-muted-foreground', className)}>
    {credit.poweredBy && <a
      href={OWLMEANS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="underline-offset-4 hover:text-foreground hover:underline"
    >
      {t('login.powered', 'Powered by OwlMeans')}
    </a>}
    {credit.poweredBy && credit.line != null && <span aria-hidden="true"> · </span>}
    {credit.line != null && <span>{credit.line}</span>}
  </p>
}
