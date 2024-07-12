import { PanelApp } from '@owlmeans/client-panel'
import type { RenderOptions, AppConfig, AppContext } from '@owlmeans/web-client'
import { render as basicRender, provide } from '@owlmeans/web-client'
import type { FC } from 'react'
import { useI18nInstance } from '@owlmeans/client-i18n/utils'
import detector from 'i18next-browser-languagedetector'

export const render = <C extends AppConfig, T extends AppContext<C>>(context: T, opts?: RenderOptions) => {
  basicRender(<App context={context as T} />, opts)
}

const App: FC<{ context: AppContext<any>}> = ({ context }) => {
  const i18nInstance = useI18nInstance(context.cfg)
  i18nInstance.use(detector)
  
  return <PanelApp context={context} provide={provide} />
}
