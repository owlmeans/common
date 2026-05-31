import type { FC } from 'react'
import type { PanelAppProps } from './types.js'

import { App } from '@owlmeans/client'
import { I18nContext } from '@owlmeans/client-i18n'
import { cn } from '@/lib/utils'

export const PanelApp: FC<PanelAppProps> = ({ context, provide, children, rootClassName }) => {
  return <div className={cn('min-h-screen bg-background text-foreground', rootClassName)}>
    <I18nContext config={context.cfg}>
      <App context={context} provide={provide}>
        {children}
      </App>
    </I18nContext>
  </div>
}
