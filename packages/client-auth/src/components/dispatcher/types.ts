import type { FC, PropsWithChildren } from 'react'
import type { RoutedComponent } from '@owlmeans/client'
import type { AuthToken } from '@owlmeans/auth'
import type { Context } from '../../types.js'

export interface DispatcherProps {
  context: Context
}

export interface TDispatcherHOC {
  (Renderer: DispatcherRenderer): RoutedComponent<DispatcherProps>
}

export interface DispatcherRenderer extends FC<DispatcherRendererProps> {
}

export interface DispatcherRendererProps extends PropsWithChildren {
  provideToken: (token: AuthToken) => void
}
