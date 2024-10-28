import type { AllowanceRequest, Auth, AuthCredentials, RelyToken } from '@owlmeans/auth'
import { AUTH_SCOPE, AuthenticationStage, AuthenticationType, AuthPluginError, AuthRole, RELY_3RD } from '@owlmeans/auth'
import type { AuthenticateMethod, Connection, EventMessage, Message } from '@owlmeans/socket'
import { isEventMessage, isMessage } from '@owlmeans/socket'
import type { AppContext, RelyAllowanceRequest, RelyLinker, RelyCarrier } from '../types.js'
import { makeAuthModel } from '../model.js'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { trusted } from '../utils/trusted.js'
import { RELY_TUNNEL } from '../consts.js'
import type { RedisResource } from '@owlmeans/redis-resource'
import { RELY_ACTION_TIMEOUT } from '@owlmeans/auth-common'

// 1. There is a difference between privileged (provider)
//    and non-privileged (consumer) request 
// 2. Source allows to distinguish between provider and consumer
//    but probably it needs to be universalized some way
//    cause potentially wallet can also be consumer
//    (right now consumer will request authentication type)
// 3. General idea is that: when you are connected, the auth
//    process can be started from scratch following same stages
//    and using the same plugins but via socket

export const createRelyFlow = (context: AppContext, conn: Connection, auth?: Auth | null): AuthenticateMethod => {
  const auhtenticate = conn.authenticate

  const model = makeAuthModel(context)
  let internalAuth: Auth | null = auth ?? null

  const linker: RelyLinker = async (rely, source, notify) => {
    console.log('Linker executed: ', source.nonce, ' -> ', rely.nonce)
    const tunnel = context.resource<RedisResource<Message<any>>>(RELY_TUNNEL)
    const closeReceiver = await tunnel.subscribe(async message => {
      if (isMessage(message, true)) {
        console.log('<<<<<<< Receive message: ', message)
        await conn.send(message)
      } else if (isEventMessage(message, true)) {
        if ((message as EventMessage<unknown>).event === 'close') {
          await conn.close()
          closeSender()
          await closeReceiver()
        }
      }
    }, source.nonce)
    // We allow to just forward call messages back and forth
    conn._receiveCall = async msg => { console.log(source.nonce, 'Forward call', msg.method, msg.id) }
    conn._receiveResult = async msg => { console.log(source.nonce, 'Forward result', msg.id) }
    conn._receiveError = async msg => { console.log(source.nonce, 'Forward error', msg.id) }
    conn.defaultCallTimeout = RELY_ACTION_TIMEOUT * 1000
    const closeSender = conn.listen(async message => {
      if (isMessage(message, true)) {
        const forward = { ...message }
        if (forward.rawData != null) {
          delete forward.rawData
        }
        console.log('>>>>>>> Publish message: ', message)
        await tunnel.publish(forward, rely.nonce)
      } else if (isEventMessage(message, true)) {
        console.log('We receive en event message: ', message)
        if (message.event === 'close') {
          const forward = { ...message as Message<unknown> }
          if (forward.rawData != null) {
            delete forward.rawData
          }
          await tunnel.publish(forward, rely.nonce)
          console.log('>>>>> CLOSING all <<<<<')
          closeSender()
          await closeReceiver()
        }
      }
    })
    if (notify === true) {
      internalAuth = {
        token: makeEnvelopeModel<RelyToken>(RELY_3RD).send(rely).tokenize(),
        isUser: true,
        createdAt: new Date(),
        type: AuthenticationType.RelyHandshake,
        role: AuthRole.User,
        userId: source.nonce,
        scopes: [AUTH_SCOPE]
      }
      await conn.auth(AuthenticationStage.Authenticated, internalAuth)
    }
  }

  conn.authenticate = async (stage, payload) => {
    const [, keyPair] = await trusted(context)
    switch (stage) {
      // This part of flow is entered by both consumer and provider (wallet)
      case AuthenticationStage.Init:
        const _payload = payload as RelyAllowanceRequest
        if (auth != null) {
          _payload.auth = auth
        } else if (_payload.auth != null) {
          delete _payload.auth
        }
        console.log('~~~~ PEER ACTIVITY 1', _payload.auth != null ? 'Provider' : 'Consumer')
        _payload.provideRely = linker
        _payload.conn = conn

        try {
          return [stage, await model.init(_payload as AllowanceRequest) as any]
        } catch (e) {
          console.error(e)
          await conn.close()
        }
        break
      // This part of flow is entered by that actor who enters peer's key (token or pin)
      case AuthenticationStage.Authenticate:
        try {
          const cred = payload as AuthCredentials
          console.log('~~~~ ACTOR ACTIVITY 2', cred)
          const authenticated = await model.authenticate(cred)
          const envelope = makeEnvelopeModel<Auth>(authenticated.token, EnvelopeKind.Token)
          if (!await envelope.verify(keyPair)) {
            throw new AuthPluginError('internal-rely')
          }
          if (envelope.type() !== AuthenticationType.RelyHandshake) {
            throw new AuthPluginError('internal-rely')
          }
          internalAuth = envelope.message()

          const token = makeEnvelopeModel<RelyCarrier>(internalAuth.token, EnvelopeKind.Token).message()

          await linker(token.rely, token.source)

          return [AuthenticationStage.Authenticated, internalAuth as any]
        } catch (e) {
          console.error(e)
          await conn.close()
        }
        break
      // Support intermediate stage for visual confirmation
      case AuthenticationStage.Authenticated:
        return [stage, internalAuth as any]
      default:
        return auhtenticate(stage, payload)
    }
    return [stage, null as any]
  }

  return conn.authenticate
}
