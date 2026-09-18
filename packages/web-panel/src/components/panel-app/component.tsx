import type { FC } from 'react'
import type { PanelAppProps } from './types.js'

import { App } from '@owlmeans/client'
import { I18nContext } from '@owlmeans/client-i18n'
import { cn } from '../../@/lib/utils.js'
import { SocketReloadDialog } from '../socket/reload-dialog.js'

export const PanelApp: FC<PanelAppProps> = ({ context, provide, children, rootClassName }) => {
  return <div className={cn('min-h-screen bg-background text-foreground', rootClassName)}>
    <I18nContext config={context.cfg}>
      <App context={context} provide={provide}>
        {children}
        {/*
          A sibling of the Router, exactly like `PanelCookieConsent` — a dialog mounted inside a
          route is torn down on every navigation, which for a modal means it closes itself the
          first time anything moves. Opt-in per app via `cfg.socket.reloadDialog`; the component
          itself stays inert (renders nothing) whenever the flag is off or nothing is `'lost'`.
        */}
        {context.cfg.socket?.reloadDialog === true && <SocketReloadDialog />}
      </App>
    </I18nContext>
  </div>
}
