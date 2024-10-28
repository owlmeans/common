import { MessageType } from './consts.js'
import type { CallMessage, EventMessage, Message } from './types.js'

export const isMessage = <P, T extends Message<P>>(msg: string | T, nonSystem?: boolean): msg is T =>
  typeof msg === 'object' && 'type' in msg && 'payload' in msg
  && (nonSystem === undefined || nonSystem === (msg.type !== MessageType.System))

export const isEventMessage = <P>(msg: string | Message<P>, system?: boolean): msg is EventMessage<P> =>
  isMessage(msg) && [MessageType.Event, MessageType.System].includes(msg.type)
  && (system === undefined || system === (msg.type === MessageType.System))

export const isCallMessage = <P extends any[]>(msg: string | Message<unknown>): msg is CallMessage<P> =>
  isMessage(msg) && msg.type === MessageType.Call


// export const prepareLongCalls = (connection: Connection, longTimeout = CALL_TIMEOUT * 10) => {
//   const _connection = connection as WithLongCalls
//   if (_connection[long_calls] == null) {
//     const prepare = connection.prepare
//     connection.prepare = (message, isRequest) => {
//       if (!isRequest && isCallMessage(message)) {
//         message.timeout = longTimeout
//       }

//       return prepare?.(message, isRequest) ?? message
//     }
//     _connection[long_calls] = true
//   }
  
//   return connection
// }

// const long_calls = Symbol('__prepare_with_long_calls')
// interface WithLongCalls extends Connection {
//   [long_calls]: boolean
// }
