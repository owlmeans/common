import type { Config, Context } from '../types.js'
import type { Connection, EventMessage as EMessage } from '@owlmeans/socket'
import { createBasicConnection, MessageType } from '@owlmeans/socket'

export const makeConnection = <C extends Config = Config, T extends Context<C> = Context<C>>(
  conn: WebSocket, _context: T
): Connection => {
  const model = createBasicConnection()

  model.send = async message => {
    if (typeof message === 'object') {
      console.log('Sending message: ', message.type)
    }
    if (typeof message !== 'string') {
      model.prepare?.(message)
    }
    conn.send(typeof message === 'string' ? message : JSON.stringify(message))
  }

  model.close = async () => {
    conn.close()
    // @TODO Make sure it trigger close observers
  }

  model.authenticate = async (_stage, _payload) => {
    // @TODO Provide authentication flow logic here
    return [] as any
  }

  model.prepare = (message, _isRequest) => {
    // @TODO add sender / recipient metadata
    message.dt = message.dt ?? Date.now()
    return message
  }

  const messageHandler = async (message: MessageEvent) => {
    await model.receive(message.data)
  }
  const closeHandler = async (event: CloseEvent) => {
    console.log('Connection closed with code:', event.code)
    const msg: EMessage<{ code: number }> = {
      type: MessageType.System,
      event: 'close',
      payload: { code: event.code }
    }
    if (model.prepare != null) {
      model.prepare(msg)
    }
    await Promise.all(model.getListeners().map(async listener => listener(msg)))
    conn.removeEventListener('message', messageHandler)
    conn.removeEventListener('close', closeHandler)
  }
  conn.addEventListener('message', messageHandler)
  conn.addEventListener('close', closeHandler)

  return model
}
