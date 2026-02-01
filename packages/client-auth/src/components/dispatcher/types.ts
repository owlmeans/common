import type { FC, PropsWithChildren } from 'react'
import type { RoutedComponent } from '@owlmeans/client'
import type { AuthToken } from '@owlmeans/auth'
import type { ClientContext, ClientConfig } from '@owlmeans/client-context'
import type { AbstractRequest } from '@owlmeans/module'
import type { FlowPayload } from '@owlmeans/flow'

export interface DispatcherProps {
  alias: string
  params: AbstractRequest['params']
  query?: AbstractRequest['query']
  context: ClientContext<ClientConfig>
  payload?: FlowPayload
}

export interface TDispatcherHOC {
  (Renderer: DispatcherRenderer): RoutedComponent<DispatcherProps>
}

export interface DispatcherRenderer extends FC<DispatcherRendererProps> {
}

export interface DispatcherRendererProps extends PropsWithChildren {
  provideToken: (token: AuthToken, query?: AbstractRequest['params']) => void
  navigate: () => Promise<void>
}
