import type { ResilientError } from '@owlmeans/error'
import type { MessageType } from './consts.js'
import type { AuthenticationStage } from '@owlmeans/auth'

export interface Connection {
  _authSequence?: CallResolver<any>

  notify: <T>(event: string, payload: T) => Promise<void>
  observe: <T>(event: string, handler: (event: EventMessage<T>) => Promise<void>) => () => void

  call: <R, T extends any[]>(method: string, ...payload: T) => Promise<R>
  perform: <R, T extends any[]>(method: string, handler: CallHendler<R, T>) => void

  request: <T, R>(payload: T, observer?: (payload: R) => Promise<boolean>) => Promise<() => void>
  observeResponse: <T>(observer: (payload: T) => Promise<boolean>) => Promise<() => void>
  acknowledge: <T>(handler: RequestHandler<T>) => () => void
  reply: <T>(id: string, payload: T) => Promise<void>

  listen: (listner: ConnectionListener) => () => void

  auth: <T, R>(stage: AuthenticationStage, payload: T) => Promise<R>

  enqueue: <T>(payload: T, id?: string) => Promise<void>
  enqueued: () => number
  consume: <T>(filter?: (payload: T) => boolean) => [T | null, string | null | undefined, number] | null

  /**
   * @abstract
   */
  close: () => Promise<void>

  /**
   * Methods called by the socket connection
   */
  receive: (message: string) => Promise<void>
  /**
   * @abstract
   */
  send: (message: Message<any> | string) => Promise<void>
  /**
   * @abstract
   */
  prepare?: <T>(message: Message<T>, isRequest?: boolean) => Message<T>
  /**
   * @abstract
   */
  authenticate: <T, R>(stage: AuthenticationStage, payload: T) => Promise<R>

  /**
   * Utility methods
   */
  _receiveCall: (message: CallMessage<any>) => Promise<void>
  _receiveResult: (message: Message<any>) => Promise<void>
  _receiveError: (message: Message<any>) => Promise<void>
  _receiveRequest: (message: Message<any>) => Promise<void>
  _receiveResponse: (message: Message<any>) => Promise<void>
  _receiveEvent: (message: EventMessage<any>) => Promise<void>
  _receiveMessage: (message: Message<any>) => Promise<void>
}

export interface ConnectionListener {
  (message: Message<any> | string): Promise<void>
}

export interface CallHendler<R, T extends any[]> {
  (...args: T): Promise<R>
}

export interface RequestHandler<T> {
  (id: string, payload: T): Promise<boolean>
}

export interface Message<T> {
  type: MessageType
  id?: string
  rawData?: string
  sender?: string
  recipient?: string
  payload: T
}

export interface CallMessage<T extends any[]> extends Message<T> {
  type: MessageType.Call
  method: string
  timeout?: number
}

export interface EventMessage<T> extends Message<T> {
  type: MessageType.Event
  event: string
}

export interface AuthMessage<T> extends Message<T> {
  type: MessageType.Auth
  stage: AuthenticationStage
}

export interface CallResolver<T> {
  resolve: (result: T) => void
  reject: (error: ResilientError) => void
}
