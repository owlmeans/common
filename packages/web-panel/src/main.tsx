import { PanelApp } from '@owlmeans/client-panel'
import type { RenderOptions } from '@owlmeans/web-client'
import type { ContextType as Context } from '@owlmeans/client'
import { render as basicRender, provide } from '@owlmeans/web-client'

export const render = (context: Context, opts?: RenderOptions) => {
  basicRender(<PanelApp context={context} provide={provide} />, opts)
}
