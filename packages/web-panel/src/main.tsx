import { PanelApp } from '@owlmeans/client-panel'
import type { RenderOptions } from '@owlmeans/web-client'
import { render as basicRender, provide } from '@owlmeans/web-client'
import { AppConfig, AppContext } from './types'

export const render = <C extends AppConfig, T extends AppContext<C>>(context: T, opts?: RenderOptions) => {
  basicRender(<PanelApp context={context} provide={provide} />, opts)
}
