import type { InitializedService, LazyService } from '@owlmeans/context'
import type { FC } from 'react'
import type { ClientContext, Navigator } from '../types.js'

export interface Toggleable {
  opened: boolean
  open: () => void
  close: () => void
  set: (opened: boolean) => void
  toggle: () => void
}

export interface ModalService extends InitializedService {
  toggle: Toggleable
  stack: ModalStackLayer[]
  navigator?: Navigator
  layer: () => ModalStackLayer | undefined
  link: (toggle: Toggleable) => void
  request: <T>(Com: FC<ModalBodyProps>) => Promise<T | null>
  error: (error: Error) => void
  response: <T>(value: T) => void
  cancel: () => void
}

export interface ModalStackLayer {
  Com: FC<ModalBodyProps>
  resolve?: (v: unknown | null) => void,
  reject?: (e: Error) => void
}

export interface ModalBodyProps {
  modal?: ModalService
}

export interface ModalServiceAppend {
  modal: () => ModalService
}

export interface DebugService extends LazyService {
  Debug: FC<ModalBodyProps>
  items: DebugMenuItem[]
  addItem: (item: DebugMenuItem) => void
  erase: (states: string[]) => Promise<void>
  select: (alias: string) => void
  open: () => void
}

export interface DebugMenuItem {
  alias: string
  title: string
  Com?: FC<ModalBodyProps>
  action?: (modal: ModalService, context: ClientContext) => Promise<void | string>
}

export interface DebugServiceAppend {
  debug: () => DebugService | undefined
}
