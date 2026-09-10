import type { FC } from 'react'
import { cn } from '@/lib/utils'
import type { LoginCreditModel } from '@owlmeans/client-panel/auth'

export interface LoginCreditProps {
  model: LoginCreditModel
  translate: (key: string, defaultValue: string) => string
  className?: string
}

/**
 * The line at the bottom of a sign-in screen.
 *
 * Two halves, and each may stand alone: the platform credit, and who the application belongs to.
 * A generated application shows both — "Powered by OwlMeans" beside its own product and
 * organization — and an application whose owner has paid to drop the credit shows only the second.
 * Rendering nothing at all is also correct, for an app that is neither.
 */
export const LoginCredit: FC<LoginCreditProps> = ({ model, translate, className }) => {
  if (!model.poweredBy && model.line == null) {
    return null
  }

  return <p
    data-login-credit
    className={cn('text-center text-xs text-muted-foreground', className)}
  >
    {model.poweredBy && <span data-login-powered>
      {translate('login.credit.powered', 'Powered by OwlMeans')}
    </span>}
    {model.poweredBy && model.line != null && <span aria-hidden="true"> · </span>}
    {model.line != null && <span>{model.line}</span>}
  </p>
}
