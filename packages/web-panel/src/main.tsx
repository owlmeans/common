import type { RenderOptions, AppContext } from '@owlmeans/web-client'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { render as basicRender, provide } from '@owlmeans/web-client'
import type { FC } from 'react'
import { useI18nInstance } from '@owlmeans/client-i18n/utils'
import detector from 'i18next-browser-languagedetector'
import { PanelApp } from './components/panel-app/component.js'

export interface WebRenderOptions extends RenderOptions {
  rootClassName?: string
}

export const render = <C extends ClientConfig, T extends ClientContext<C>>(context: T, opts?: WebRenderOptions) => {
  basicRender(<App context={context as unknown as AppContext} rootClassName={opts?.rootClassName}/>, opts)
}

const App: FC<{ context: AppContext<any>, rootClassName?: string }> = ({ context, rootClassName }) => {
  const i18nInstance = useI18nInstance(context.cfg)
  i18nInstance.use(detector)

  return <PanelApp context={context} provide={provide} rootClassName={rootClassName} />
}
