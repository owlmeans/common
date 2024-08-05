import type { WebSocket } from '@fastify/websocket'
import type { Connection, EventMessage } from '@owlmeans/socket'
import type { Config, Context } from '@owlmeans/server-api'
import {
  SocketUnsupported, createBasicConnection, MessageType, SocketInitializationError,
  SocketUnauthorized
} from '@owlmeans/socket'
import { AbstractRequest } from '@owlmeans/module'
import { AuthenticationStage, AUTH_QUERY } from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { isAuth, isAuthCredentials, isAuthToken } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { AuthServiceAppend } from '@owlmeans/server-auth'

export const makeConnection = <C extends Config, T extends Context<C> = Context<C>>(
  request: AbstractRequest<WebSocket>, context: T
): Connection => {
  if (request.body == null) {
    throw new SocketInitializationError('request')
  }
  let auth: Auth | AuthCredentials | null | undefined = undefined
  const conn = request.body

  const model = createBasicConnection()

  model.close = async () => {
    await conn.close()
    // @TODO check if on close event is triggered
  }

  model.send = async message => {
    if (typeof message !== 'string') {
      model.prepare?.(message)
    }
    await conn.send(typeof message === 'string' ? message : JSON.stringify(message))
  }

  // @TODO This method is fully supported only by authentication services
  model.authenticate = async (stage, payload) => {
    if (AuthenticationStage.Authenticate === stage) {
      if (isAuthToken(payload)) {
        const ctx = context as AuthServiceAppend & T
        const _auth = await ctx.auth().authenticate(payload)
        if (_auth == null) {
          throw new SocketUnauthorized(stage)
        }
        const model = makeEnvelopeModel<Auth>(_auth.token, EnvelopeKind.Token)
        auth = model.message()

        return [AuthenticationStage.Authenticated, _auth as any]
      }
      if (isAuth(payload)) {
        auth = payload

        return [stage, auth as any]
      }
    } else if (AuthenticationStage.Authenticated === stage) {
      if (auth == null) {
        throw new SocketUnauthorized(stage)
      }

      return [stage, auth as any]
    }
    throw new SocketUnsupported('auth-service')
  }

  model.prepare = (message, isRequest) => {
    if (auth === undefined) {
      auth = null
      try {
        let authorization = (request.query as any)?.[AUTH_QUERY]
        if (authorization != null) {
          const envelope = makeEnvelopeModel<Auth | AuthCredentials>(authorization, EnvelopeKind.Token)
          const _auth = envelope.message()
          if (isAuth(_auth) || isAuthCredentials(_auth)) {
            auth = _auth
          }
        }
      } catch {
        auth = null
      }
    }
    if (isRequest) {
      if (auth != null && message.recipient == null) {
        message.recipient = auth.profileId ?? auth.userId
      }
      if (message.sender == null) {
        // @TODO think about using dids here
        message.sender = context.cfg.service
      }
    } else {
      if (auth != null && message.sender == null) {
        message.sender = auth.profileId ?? auth.userId
      }
    }

    return message
  }

  const messageHandler = async (message: string) => {
    await model.receive(message)
  }
  const closeHandler = async (code: number) => {
    console.log('Connection closed with code:', code)
    const msg: EventMessage<{ code: number }> = {
      type: MessageType.System,
      event: 'close',
      payload: { code }
    }
    if (model.prepare != null) {
      model.prepare(msg)
    }
    await Promise.all(model.getListeners().map(async listener => listener(msg)))
    conn.off('message', messageHandler)
    conn.off('close', closeHandler)
  }
  conn.on('message', messageHandler)
  conn.on('close', closeHandler)

  return model
}
