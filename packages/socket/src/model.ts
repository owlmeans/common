import { ResilientError } from '@owlmeans/error'
import { CALL_TIMEOUT, MessageType } from './consts.js'
import { SocketMessageMalformed, SocketTimeout } from './errors.js'
import type {
  AuthMessage, CallHendler, CallMessage, CallResolver, Connection, ConnectionListener,
  EventMessage, Message, RequestHandler
} from './types.js'
import { uuid } from '@owlmeans/basic-ids'
import { AuthenticationStage, AuthError } from '@owlmeans/auth'

export const createBasicConnection = (): Connection => {
  const listeners: ConnectionListener[] = []

  const callPerformers: { [method: string]: CallHendler<any, any[]> } = {}
  const calls: { [id: string]: CallResolver<any> } = {}
  const requestAcknowledgers: RequestHandler<any>[] = []
  const observers: { [id: string]: (payload: any) => Promise<boolean> } = {}
  const responseObservers: ((payload: any) => Promise<boolean>)[] = []
  const eventObservers: { [event: string]: ((event: EventMessage<any>) => Promise<void>)[] } = {}
  const queue: Message<any>[] = []

  const conn: Connection = {
    stage: AuthenticationStage.Init,

    send: async () => {
      throw new SyntaxError('Connection send method is not implemented')
    },
    close: async () => {
      throw new SyntaxError('Connection close method is not implemented')
    },
    authenticate: async () => {
      throw new SyntaxError('Connection authenticate method is not implemented')
    },

    notify: async (event, payload) => {
      const msg: EventMessage<any> = {
        event, payload, type: MessageType.Event
      }
      await conn.send(msg)
    },

    observe: (event, handler) => {
      eventObservers[event] = eventObservers[event] ?? []
      eventObservers[event].push(handler)
      return () => {
        const index = eventObservers[event].indexOf(handler)
        if (index !== -1) {
          eventObservers[event].splice(index, 1)
        }
      }
    },

    call: async (method, ...payload) => {
      const msg: CallMessage<any> = {
        method, payload, type: MessageType.Call, id: uuid()
      }
      conn.prepare?.(msg)
      return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new SocketTimeout('call')), msg.timeout ?? CALL_TIMEOUT
        )
        calls[msg.id!] = {
          resolve: value => {
            clearTimeout(timeout)
            delete calls[msg.id!]
            resolve(value)
          }, reject: error => {
            clearTimeout(timeout)
            delete calls[msg.id!]
            reject(error)
          }
        }

        try {
          await conn.send(msg)
        } catch (e) {
          clearTimeout(timeout)
          delete calls[msg.id!]
          reject(e)
        }
      })
    },

    perform: async (method, handler) => {
      callPerformers[method] = handler
    },

    request: async (payload, observer) => {
      const msg: Message<any> = {
        type: MessageType.Request, payload, id: uuid()
      }
      if (observer != null) {
        observers[msg.id!] = observer
      }
      await conn.send(msg)

      return () => {
        if (observers[msg.id!] != null) {
          delete observers[msg.id!]
        }
      }
    },

    observeResponse: async observer => {
      responseObservers.push(observer)
      return () => {
        const index = responseObservers.indexOf(observer)
        if (index !== -1) {
          responseObservers.splice(index, 1)
        }
      }
    },

    acknowledge: handler => {
      requestAcknowledgers.push(handler)

      return () => {
        const index = requestAcknowledgers.indexOf(handler)
        if (index !== -1) {
          requestAcknowledgers.splice(index, 1)
        }
      }
    },

    reply: async (id, payload) => {
      const msg: Message<any> = {
        type: MessageType.Response, payload, id
      }
      await conn.send(msg)
    },

    listen: listener => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index !== -1) {
          listeners.splice(index, 1)
        }
      }
    },

    auth: async (stage, payload) => {
      conn.stage = stage
      const msg: AuthMessage<any> = { type: MessageType.Auth, stage, payload }

      return new Promise(async (resolve, reject) => {
        conn._authSequence = { reject, resolve }
        await conn.send(msg)
      })
    },

    enqueue: async (payload, id) => {
      const msg: Message<any> = {
        type: MessageType.Message, payload, id
      }
      await conn.send(msg)
    },

    enqueued: () => queue.length,

    consume: filter => {
      if (queue.length === 0) {
        return null
      }
      if (filter == null) {
        const msg = queue.shift()
        return [msg?.payload ?? null, msg?.id, queue.length]
      }
      const index = queue.findIndex(msg => filter(msg.payload))
      if (index < 0) {
        return [null, null, queue.length]
      }
      const [msg] = queue.splice(index, 1)

      return [msg.payload, msg.id, queue.length]
    },

    receive: async message => {
      if (message.startsWith('{') || message.startsWith('[')) {
        let msg: Message<any> | string = message
        try {
          msg = JSON.parse(message)
        } catch (e) {
        }
        if (typeof msg === 'object') {
          if (msg.payload == null) {
            msg.payload = msg
          }
          if (msg.type == null) {
            msg.type = MessageType.Message
          }
          msg.rawData = message
          if (conn.prepare != null) {
            conn.prepare(msg, true)
          }
          try {
            switch (msg.type) {
              case MessageType.Call: {
                await conn._receiveCall(msg as CallMessage<any>)
                break
              }
              case MessageType.Result: {
                await conn._receiveResult(msg)
                break
              }
              case MessageType.Error: {
                await conn._receiveError(msg)
                break
              }
              case MessageType.Request: {
                await conn._receiveRequest(msg)
                break
              }
              case MessageType.Response: {
                await conn._receiveResponse(msg)
                break
              }
              case MessageType.Event: {
                await conn._receiveEvent(msg as EventMessage<any>)
                break
              }
              case MessageType.Message: {
                await conn._receiveMessage(msg)
                break
              }
              case MessageType.Auth: {
                const _msg: AuthMessage<any> = msg as AuthMessage<any>
                if (conn._authSequence != null) {
                  if (_msg.stage == null) {
                    conn._authSequence.reject(ResilientError.ensure(_msg.payload ?? new AuthError('socket:unknown')))
                  } else {
                    conn.stage = _msg.stage
                    conn._authSequence.resolve(_msg.payload)
                  }
                  conn._authSequence = undefined
                } else {
                  try {
                    const [stage, response] = await conn.authenticate(_msg.stage, _msg.payload)
                    if (stage != null) {
                      conn.auth(stage, response)
                    }
                  } catch (e) {
                    conn.auth(null as any, ResilientError.marshal(ResilientError.ensure(e as Error)))
                  } finally {
                    conn._authSequence = undefined
                  }
                }
                break
              }
            }
          } catch (e) {
            throw ResilientError.ensure(e as Error)
          }
        }
        await Promise.all(listeners.map(async listener => listener(msg)))
      }
    },

    _receiveCall: async msg => {
      let cancel = false
      callPerformers[msg.method](...msg.payload)
        .then(async result => {
          if (cancel) {
            return
          }
          clearTimeout(timeout)
          const response: Message<any> = {
            id: msg.id,
            type: MessageType.Response,
            payload: result
          }
          await conn.send(response)
        }).catch(async error => {
          if (cancel) {
            return
          }
          clearTimeout(timeout)
          const response: Message<any> = {
            id: msg.id,
            type: MessageType.Error,
            payload: ResilientError.ensure(error).marshal().message
          }
          await conn.send(response)
        })
      const timeout = setTimeout(() => {
        cancel = true
      }, msg.timeout ?? CALL_TIMEOUT)
    },

    _receiveResult: async msg => {
      if (msg.id == null) {
        throw new SocketMessageMalformed('result:id')
      }
      if (calls[msg.id] == null) {
        throw new SocketTimeout('result')
      }
      calls[msg.id].resolve(msg.payload)
      delete calls[msg.id]
    },

    _receiveError: async msg => {
      if (msg.id == null) {
        throw new SocketMessageMalformed('result:id')
      }
      if (calls[msg.id] == null) {
        throw new SocketTimeout('result')
      }
      calls[msg.id].reject(ResilientError.ensure(msg.payload))
      delete calls[msg.id]
    },

    _receiveRequest: async msg => {
      if (msg.id == null) {
        throw new SocketMessageMalformed('request:id')
      }
      await requestAcknowledgers.reduce<Promise<boolean>>(
        async (acknowledge, acknowledger) => {
          if (await acknowledge) {
            return acknowledge
          }
          return acknowledger(msg.id as string, msg.payload)
        }, Promise.resolve(false)
      )
    },

    _receiveResponse: async msg => {
      if (msg.id == null) {
        throw new SocketMessageMalformed('response:id')
      }
      if (observers[msg.id] == null) {
        await observers[msg.id](msg.payload)
        delete observers[msg.id]
      }
      await responseObservers.reduce<Promise<boolean>>(
        async (captured, observer) => {
          if (await captured) {
            return captured
          }
          return observer(msg.payload)
        }, Promise.resolve(false)
      )
    },

    _receiveEvent: async msg => {
      if (msg.event == null) {
        throw new SocketMessageMalformed('event')
      }
      if (eventObservers[msg.event] == null) {
        return
      }
      await Promise.all(eventObservers[msg.event].map(async observer => observer(msg)))
    },

    _receiveMessage: async msg => {
      queue.push(msg)
    },

    getListeners: () => listeners
  }

  return conn
}
