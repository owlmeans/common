import { type PanelNavLink, HOME } from '@owlmeans/web-panel'

/** The alias the session items are stored under. Screens address the store by it, never by path. */
export const SESSION_STATE = 'session-items'

// The platform/owner credit — "Powered by OwlMeans" and the copyright the platform delivers — is
// rendered by the shell itself (`NavLayout`'s `Footer`) and is never a footer link: an app link
// list is places IN the app, and the credit is not one of those.
export const footerLinks: PanelNavLink[] = [
  { alias: HOME, label: '__APP_NAME__' },
]
