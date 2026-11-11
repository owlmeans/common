import type { CaptchaClient, CaptchaClients } from './types.js'

/**
 * A registry of captcha clients by provider id. A page has one (`captchaClients`); a test or an
 * embedded bundle may build its own.
 */
export const createCaptchaClients = (): CaptchaClients => {
  const clients = new Map<string, CaptchaClient>()

  const register: CaptchaClients['register'] = client => {
    clients.delete(client.id)
    clients.set(client.id, client)

    return client
  }

  const get: CaptchaClients['get'] = id => {
    if (id != null && id !== '') {
      return clients.get(id) ?? null
    }

    return clients.size === 1 ? [...clients.values()][0] : null
  }

  const list: CaptchaClients['list'] = () => [...clients.values()]

  return { register, get, list }
}

/** The page's captcha clients — where a provider package's `append*` registers its client. */
export const captchaClients = createCaptchaClients()
