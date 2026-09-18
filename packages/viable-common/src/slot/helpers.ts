import { WorkloadKind } from './consts.js'

/** The minimum a caller must know about a slot to address it. */
export interface AddressableSlot {
  kind?: WorkloadKind
  host?: string
}

/**
 * The origin a slot's application answers at.
 *
 * Read back from the slot's stored `host`, never recomposed from a slug — a preview host is a
 * CLAIMED resource with a certificate behind it, and the name a slot ended up with is not always
 * the name its project would compose today. What this adds is the scheme, which is the one part
 * that follows from the kind rather than from the record: a local target is a loopback address and
 * therefore `http`, everything else is TLS-terminated at an edge and therefore `https`.
 */
export const slotOrigin = (slot: AddressableSlot): string => {
  const host = slot.host ?? ''
  if (host === '') return ''
  if (host.startsWith('http://') || host.startsWith('https://')) return host

  return `${slot.kind === WorkloadKind.Local ? 'http' : 'https'}://${host}`
}

/**
 * The exact redirect URIs a target's OIDC client must carry for one origin.
 *
 * Exact, because a provider matches a redirect URI literally and refuses a wildcard — and both
 * entries are needed: the callback the login round trip returns to, and the bare origin, which is
 * where the application's own logout lands.
 */
export const targetRedirectUrisForOrigin = (origin: string, callbackPath: string): string[] =>
  origin === '' ? [] : [origin, `${origin}${callbackPath}`]
