import type { AppConfig, AppContext } from '@owlmeans/web-client'
import type { AuthStateProperties, OidcAuthStateModel, OidcInteraction, WithSharedConfig } from './types.js'
import Cookies from 'universal-cookie'
import { OidcAuthState } from './consts.js'
import type { Auth } from '@owlmeans/auth'

const stateCache: Record<string, AuthStateProperties> = {}
export const makeAuthStateModel = <C extends AppConfig, T extends AppContext<C>>(
  context: T,
  updateState: (uid: string) => Promise<{ entityId?: string, did?: string }>,
): OidcAuthStateModel => {
  const cookies = new Cookies(null, { path: '/' })
  const config = context.cfg as Partial<AppConfig> as (Partial<AppConfig> & WithSharedConfig)

  const store = () => context.auth().store<OidcInteraction>()

  const stackKey = `_oidc-interaction:stack`
  const cookieKey = config.oidc.clientCookie?.interaction?.name ?? '_interaction'
  const cookieTtl = () => {
    const ttl = (config.oidc.clientCookie?.interaction?.ttl ?? 3600) * 1000

    const expiration = new Date()
    expiration.setTime(expiration.getTime() + ttl)

    return expiration
  }

  const model: OidcAuthStateModel = {
    state: new Set(),

    uid: '',

    getState: () => [...model.state],

    init: async (uid, reset = false) => {
      const currentUid = cookies.get(cookieKey)
      if (currentUid != null && uid === '-') {
        uid = currentUid
      }
      if (uid == null) {
        throw new SyntaxError('no-uid')
      }
      if (stateCache[uid] != null) {
        console.log('no real initailization')
        Object.assign(model, stateCache[uid])

        return model
      }
      if (currentUid != null && currentUid !== uid) {
        let stack = await store().load(stackKey)
        if (stack == null) {
          stack = { stack: [], id: stackKey }
        } else if (reset) {
          await store().save({ stack: [], id: stackKey })
        } else {
          const token = await context.auth().authenticated()
          stack.stack.push({ uid: currentUid, token })
          await store().save(stack)
        }
      }

      // cookies.remove(cookieKey)
      cookies.set(cookieKey, uid, { expires: cookieTtl() })

      model.uid = uid
      await model.updateAuthState(uid)

      stateCache[uid] = { ...model }

      return model
    },

    updateAuthState: async uid => {
      model.state = new Set<OidcAuthState>()

      const serverState = await updateState(uid)
      console.log('UPDATED STATE', serverState)
      model.entitId = serverState.entityId ?? config.defaultEntityId
      model.did = serverState.did
      let user: Auth | null = null
      if (await context.auth().authenticated()) {
        user = context.auth().user()
        model.state.add(OidcAuthState.Authenticated)
      }

      if (model.entitId === user?.entityId) {
        model.state.add(OidcAuthState.SameEntity)
      }

      if (model.did != null) {
        model.state.add(OidcAuthState.IdLinked)
      }

      stateCache[uid] = { ...model }

      return [...model.state]
    },

    isAuthenticated: () => model.state.has(OidcAuthState.Authenticated),

    isSameEntity: () => model.state.has(OidcAuthState.SameEntity),

    isIdLinked: () => model.state.has(OidcAuthState.IdLinked),

    profileExists: () => model.state.has(OidcAuthState.ProfileExists),

    isRegistrationAllowed: () => model.state.has(OidcAuthState.RegistrationAllowed),

    finishInteraction: async (skipState = false) => {
      const stack = await store().load(stackKey)
      if (stateCache[model.uid] != null) {
        delete stateCache[model.uid]
      }
      if (stack != null) {
        const item = stack.stack.pop()
        if (item != null) {
          model.uid = item.uid
          cookies.set(cookieKey, model.uid, { expires: cookieTtl() })
          await store().save(stack)
          if (!skipState) {
            await model.updateAuthState(model.uid)
          }
        }
      }
    }
  }

  return model
}
