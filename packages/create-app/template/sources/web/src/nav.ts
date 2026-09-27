import { HOME } from '@owlmeans/web-panel'
import type { PanelNavConfig, PanelNavLink } from '@owlmeans/web-panel'
import { web } from '__APP_SLUG__-common'

/**
 * The application's navigation, as data.
 *
 * Sections are the top menu; their items are the side menu of whichever section is active.
 * A section holding ONE item renders no side menu at all — `home` below shows that, `demo`
 * shows the two-level case. Labels here are literal; drop them to fall back on the panel
 * i18n keys (`nav.<section>` / `modules.<alias>`) instead.
 */
export const navConfig: PanelNavConfig = {
  sections: [
    { name: 'home', label: 'Home', items: [{ alias: HOME, label: 'Overview' }] },
    {
      name: 'demo', label: 'Demo', items: [
        { alias: web.session.alias, label: 'Session' },
        { alias: web.about.alias, label: 'About' },
      ]
    },
  ],
}

// The platform/owner credit — "Powered by OwlMeans" and the copyright the platform delivers — is
// rendered by the shell itself (`NavLayout`'s `Footer`) and is never a footer link: an app link
// list is places IN the app, and the credit is not one of those.
export const footerLinks: PanelNavLink[] = [
  { alias: HOME, label: '__APP_NAME__' },
]
