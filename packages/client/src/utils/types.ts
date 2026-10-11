import type { FC, PropsWithChildren, ReactElement } from 'react'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { Context } from './types.local.js'

export type HandledRenderer<T extends {}> = FC<PropsWithChildren<T> | T> | ReactElement

export interface RendererParams {
  context: Context,
  module: ClientEntrypoint<unknown>
  hasChildren: boolean
}

export interface EntrypointTreeVisitor<T, R> {
  (module: ClientEntrypoint<T>, children: R[], alone: boolean): Promise<R>
}

export interface EntrypointTree<T> extends Map<ClientEntrypoint<T>, EntrypointTree<T>> {
}
