import type { AppContext } from '@owlmeans/web-client'
import { render as basicRender } from '@owlmeans/web-client'
import { PanelApp } from '@owlmeans/web-panel'
import type { Config, Context } from './types.js'

export const render = <C extends Config, T extends Context<C>>(context: T) => {
  basicRender(<PanelApp context={context as unknown as AppContext} />)
}
