import { HOME } from '@owlmeans/web-panel'
import type { PanelNavConfig, PanelNavLink } from '@owlmeans/web-panel'

/**
 * The application's navigation, as data.
 *
 * Sections are the top menu; their items are the side menu of whichever section is active.
 * A section holding ONE item renders no side menu at all — which is why the single-screen
 * shell below shows none. Labels here are literal; drop them to fall back on the panel i18n
 * keys (`nav.<section>` / `modules.<alias>`) instead.
 */
export const navConfig: PanelNavConfig = {
  sections: [
    { name: 'home', label: 'Home', items: [{ alias: HOME, label: 'Overview' }] },
  ],
}

export const footerLinks: PanelNavLink[] = [
  { alias: HOME, label: '__APP_NAME__' },
  { href: 'https://owlmeans.com', label: 'OwlMeans', open: true },
]
