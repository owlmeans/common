import { MessageType } from './consts.js'
import type { EventMessage, Message } from './types.js'

export const isMessage = <P, T extends Message<P>>(msg: string | T, nonSystem?: boolean): msg is T =>
  typeof msg === 'object' && 'type' in msg && 'payload' in msg
  && (nonSystem === undefined || nonSystem === (msg.type !== MessageType.System))

export const isEventMessage = <P>(msg: string | Message<P>, system?: boolean): msg is EventMessage<P> =>
  isMessage(msg) && [MessageType.Event, MessageType.System].includes(msg.type)
  && (system === undefined || system === (msg.type === MessageType.System))
