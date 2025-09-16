import type { AppProps } from "@owlmeans/client"
import { I18nContext } from "@owlmeans/client-i18n"
import { App } from '@owlmeans/client'
import type { FC } from "react"

export const WebApp: FC<AppProps> = ({ context, provide, children }) => {
  return <I18nContext config={context.cfg}>
    <App context={context} provide={provide}>
      {children}
    </App>
  </I18nContext>
}
