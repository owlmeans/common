import type { AllowanceRequest, Auth, AuthCredentials } from '@owlmeans/auth'
import { AuthenticationStage, AuthenticationType, AuthPluginError } from '@owlmeans/auth'
import type { AuthenticateMethod, Connection, Message } from '@owlmeans/socket'
import { isEventMessage, isMessage } from '@owlmeans/socket'
import type { AppContext, RelyAllowanceRequest, RelyLinker, RelyToken } from '../types.js'
import { makeAuthModel } from '../model.js'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { trusted } from '../utils/trusted.js'
import { RELY_TUNNEL } from '../consts.js'
import type { RedisResource } from '@owlmeans/redis-resource'

// 1. There is a difference between privileged (provider)
//    and non-privileged (consumer) request 
// 2. Source allows to distinguish between provider and consumer
//    but probably it needs to be universalized some way
//    cause potentially wallet can also be consumer
//    (right now consumer will request authentication type)
// 3. General idea is that: when you are connected, the auth
//    process can be started from scratch following same stages
//    and using the same plugins but via socket
// We start implemnetation of ProviderHandshake / ConsumerHandshake here:
// 4. Our firs objective right now is to just establish one request
//    connection betwee provider and consumer: ProviderHandshake / ConsumerHandshake
// 5. It should lead to WalletProvider / WalletConsumer authentication,
//    that will be used by consumer for one time signature
// 6. So as outcome is transformation of this connection to one-time
//    signature / action provider schema.

export const createRelyFlow = (context: AppContext, conn: Connection, auth?: Auth | null): AuthenticateMethod => {
  const auhtenticate = conn.authenticate

  const model = makeAuthModel(context)
  let internalAuth: Auth | null = auth ?? null

  const linker: RelyLinker = async (rely, source) => {
    const tunnel = context.resource<RedisResource<Message<any>>>(RELY_TUNNEL)
    const closeReceiver = await tunnel.subscribe(async message => {
      if (isMessage(message, true)) {
        await conn.send(message), source.nonce
      }
    })
    const closeSender = conn.listen(async message => {
      if (isMessage(message, true)) {
        await tunnel.publish(message, rely.nonce)
      } else if (isEventMessage(message, true)) {
        if (message.event === 'close') {
          closeSender()
          await closeReceiver()
        }
      }
    })
  }

  conn.authenticate = async (stage, payload) => {
    const [, keyPair] = await trusted(context)
    switch (stage) {
      case AuthenticationStage.Init:
        const _payload = payload as RelyAllowanceRequest
        if (auth != null) {
          _payload.auth = auth
        } else if (_payload.auth != null) {
          delete _payload.auth
        }
        _payload.provideRely = linker

        try {
          return [stage, await model.init(_payload as AllowanceRequest) as any]
        } catch (e) {
          console.error(e)
          await conn.close()
        }
        break
      case AuthenticationStage.Authenticate:
        try {
          const cred = payload as AuthCredentials
          const authenticated = await model.authenticate(cred)
          const envelope = makeEnvelopeModel<Auth>(authenticated.token, EnvelopeKind.Token)
          if (!await envelope.verify(keyPair)) {
            throw new AuthPluginError('internal-rely')
          }
          if (envelope.type() !== AuthenticationType.RelyHandshake) {
            throw new AuthPluginError('internal-rely')
          }
          internalAuth = envelope.message()

          const token = makeEnvelopeModel<RelyToken>(internalAuth.token, EnvelopeKind.Token).message()

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
