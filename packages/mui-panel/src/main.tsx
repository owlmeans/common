import type { RenderOptions, AppContext } from '@owlmeans/web-client'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { render as basicRender, provide } from '@owlmeans/web-client'
import type { FC } from 'react'
import { useI18nInstance } from '@owlmeans/client-i18n/utils'
import detector from 'i18next-browser-languagedetector'
import { PanelApp } from './components/panel-app/component.js'
import type { Theme } from '@mui/material/styles'

export const render = <C extends ClientConfig, T extends ClientContext<C>>(context: T, theme?: Theme, opts?: RenderOptions) => {
  basicRender(<App context={context as unknown as AppContext} theme={theme}/>, opts)
}

const App: FC<{ context: AppContext<any>, theme?: Theme }> = ({ context, theme }) => {
  const i18nInstance = useI18nInstance(context.cfg)
  i18nInstance.use(detector)

  return <PanelApp context={context} provide={provide} theme={theme} />
}
