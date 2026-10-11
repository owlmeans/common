import type { ClientConfig } from '@owlmeans/client-context'
import type { EntrypointContextParams, RoutedComponent, ClientContext, LazyComponentOptions } from './types.js'
import type { HandledRenderer } from './utils/types.js'
import type { PropsWithChildren, ComponentType, ReactNode } from 'react'

export type Config = ClientConfig

export interface Context<C extends Config = Config> extends ClientContext<C> { }

// Kept as a type: its parts are function component types; an interface cannot extend a callable union.
export type RendererType = HandledRenderer<PropsWithChildren<EntrypointContextParams>> & RoutedComponent

export type Loaded = ComponentType<any>

export interface LazyModule { default: Loaded }

export interface LazyErrorBoundaryProps {
  error: LazyComponentOptions['error']
  /** Start the guarded reload for a chunk failure even though `error` is given. */
  reload: boolean
  fallback: ReactNode
  props: Record<string, unknown>
  /** Swap the failed lazy for the recreated one — batched with the boundary's own reset. */
  onRetry: () => void
  children: ReactNode
}

export interface LazyErrorBoundaryState {
  failed: boolean
  error: unknown
  /** A guarded reload has started: keep the fallback up until the new document replaces this one. */
  reloading?: boolean
}
