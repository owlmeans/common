import type { FC } from 'react'
import { useContext } from '@owlmeans/client'
import { useI18nLib } from '@owlmeans/client-i18n'
import { resolveCredit } from '@owlmeans/client-auth/login'
import type { ResolvedCredit } from '@owlmeans/client-auth/login'
import type { CommonConfig } from '@owlmeans/config'
import { cn } from '../../@/lib/utils.js'
import { OWLMEANS_URL } from '../login/credit.js'

export interface ShellCreditProps {
  className?: string
}

/**
 * The platform credit and the owner's own copyright notice, resolved from the same
 * `security.auth.login.credit` configuration the sign-in screen reads (`resolveCredit`,
 * `@owlmeans/client-auth/login`) — one source, so an owner who pays to drop the platform credit
 * drops it everywhere it can appear, not only on a screen a signed-in visitor may never see
 * again.
 *
 * Exported separately from {@link ShellCredit} so `Footer` can decide, WITHOUT rendering
 * anything, whether it has nothing at all to show — an empty bordered strip is worse than no
 * footer, and only the resolved credit knows it is empty.
 */
export const useShellCredit = (): ResolvedCredit => {
  const context = useContext()
  const cfg = (context.cfg as CommonConfig).security?.auth?.login?.credit
  const brand = (context.cfg as CommonConfig).brand

  return resolveCredit(cfg, brand, context.cfg.service)
}

/**
 * The platform credit and the owner's own copyright notice, in every area's footer.
 *
 * There is deliberately no prop to hide this component: the only way to remove the platform
 * half is the config `poweredBy: false` the entitlement gate sets, and the owner's own notice is
 * never something a restyle should be able to delete.
 *
 * Order is the opposite of the sign-in screen's `LoginCredit`: a footer is read as "whose page is
 * this, and who built it", so the owner's own copyright leads and the platform credit follows.
 */
export const ShellCredit: FC<ShellCreditProps> = ({ className }) => {
  const { poweredBy, line } = useShellCredit()
  const t = useI18nLib('auth')

  if (!poweredBy && line == null) {
    return null
  }

  return <p
    data-shell-credit
    className={cn('text-center text-xs text-muted-foreground', className)}
  >
    {line != null && <span>{line}</span>}
    {poweredBy && line != null && <span aria-hidden="true"> · </span>}
    {poweredBy && <a
      data-login-powered
      href={OWLMEANS_URL} target="_blank" rel="noopener noreferrer"
      className="underline-offset-4 hover:text-foreground hover:underline"
    >
      {t('login.credit.powered', { defaultValue: 'Powered by OwlMeans' })}
    </a>}
  </p>
}
