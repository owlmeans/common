import type { TDispatcherHOC } from './types.js'

export const DispatcherHOC: TDispatcherHOC = Renderer => () => {
  return <><Renderer /></>
}
