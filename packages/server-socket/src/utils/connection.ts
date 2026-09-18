import type { WebSocket } from '@fastify/websocket'
import type { Connection, EventMessage } from '@owlmeans/socket'
import type { Config, Context } from '@owlmeans/server-api'
import {
  SocketUnsupported, createBasicConnection, MessageType, SocketInitializationError, SocketUnauthorized
} from '@owlmeans/socket'
import { AbstractRequest } from '@owlmeans/entrypoint'
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
  let auth: Auth | AuthCredentials | null | undefined = request.auth
  const conn = request.body

  const model = createBasicConnection()
  model.requiresAuthentication = true
  if (request.auth != null) {
    // The HTTP guard already authenticated this upgrade. In-band authentication remains required
    // for unguarded socket routes before any call, request, event, or message can be dispatched.
    model.stage = AuthenticationStage.Authenticated
  }

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
      message.dt = message.dt ?? Date.now()
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

  const receiveMessage = async (_message: Buffer | Buffer[]) => {
    _message = Array.isArray(_message) ? _message : [_message]
    const message = _message.map(msg => msg.toString('utf8')).join('')

    if (message.startsWith('{') || message.startsWith('[')) {
      try {
        const parsed = JSON.parse(message)
        if (parsed.type === 'ping') {
          conn.pong()
          conn.send(JSON.stringify({ type: 'pong' }))
          return
        }
      } catch {
        // The shared parser below returns the typed malformed-frame error.
      }
    }

    await model.receive(message)
  }

  // EventEmitter does not consume a returned promise. Keep the registered callback synchronous
  // and terminate only this socket when parsing, staging, or dispatch rejects.
  const messageHandler = (_message: Buffer | Buffer[]) => {
    void receiveMessage(_message).catch(error => {
      console.error('WebSocket message rejected:', error)
      conn.close(1008)
    })
  }

  conn.on("ping", () => {
    conn.pong()
  })

  conn.on('open', (ws: WebSocket) => {
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping()
      }
    }, 30_000)
    conn.on('close', () => {
      clearInterval(heartbeat)
    })
  })

  const handleClose = async (code: number) => {
    const msg: EventMessage<{ code: number }> = {
      type: MessageType.System,
      event: 'close',
      payload: { code }
    }
    if (model.prepare != null) {
      model.prepare(msg)
    }
    await Promise.all(model.getListeners().map(async listener => {
      try {
        await listener(msg)
      } catch (error) {
        console.error('Socket close listener error:', error)
      }
    }))
    conn.off('message', messageHandler)
    conn.off('close', closeHandler)
  }

  const closeHandler = (code: number) => {
    void handleClose(code).catch(error => {
      console.error('WebSocket close handling failed:', error)
    })
  }

  conn.on('message', messageHandler)
  conn.on('close', closeHandler)

  return model
}
