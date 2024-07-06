import type { FC } from 'react'

export interface DispatcherProps {
}

export interface TDispatcherHOC {
  (Renderer: DispatcherRenderer): FC<DispatcherProps>
}

export interface DispatcherRenderer extends FC<DispatcherRendererProps> {

}

export interface DispatcherRendererProps {
}