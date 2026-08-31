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
        { alias: web.session, label: 'Session' },
        { alias: web.about, label: 'About' },
      ]
    },
  ],
}

export const footerLinks: PanelNavLink[] = [
  { alias: HOME, label: '__APP_NAME__' },
  { href: 'https://owlmeans.com', label: 'OwlMeans', open: true },
]
