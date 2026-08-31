import { useMemo } from 'react'
import type { ClientRoute } from '@owlmeans/client-route'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { Location } from '@owlmeans/router'
import { useContext, useNavigate } from '@owlmeans/client'

import type { NavTranslate, PanelNavConfig, PanelNavItem, PanelNavModel, PanelNavSection } from './types.js'

/** Default resolver: no i18n, the caller's fallback wins. See {@link NavTranslate}. */
export const defaultNavTranslate: NavTranslate = (_key, defaultValue) => defaultValue

/**
 * Turn an alias into something readable — `my-app:web:user-list` becomes `User list`.
 * The last segment is the meaningful one; the prefixes address the app, not the screen.
 */
export const defaultNavLabel = (alias: string): string => {
  const segment = alias.split(/[:.]/).filter(part => part !== '').pop() ?? alias
  const words = segment.replace(/[-_]+/g, ' ').trim()

  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const resolveNavLabel = (
  translate: NavTranslate, label: string | undefined, key: string, alias?: string
): string => label ?? translate(key, defaultNavLabel(alias ?? key))

const visibleItems = (section: PanelNavSection): PanelNavItem[] =>
  section.items.filter(item => item.hidden !== true)

const normalizePath = (path: string): string =>
  path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

/**
 * The navigation model behind both menus.
 *
 * Resolving the CURRENT screen has two sources, and both are needed. The router carries the
 * alias in `location.state`, which is authoritative — but `state` is `window.history.state`,
 * so it is null until the first in-app navigation: on a hard page load or a deep link there
 * is nothing there, and a menu keyed on it alone highlights nothing on exactly the entry that
 * matters most. The pathname is the fallback: entrypoint paths are resolved by the time the
 * router renders, so matching them is a lookup, not a guess.
 */
export const usePanelNav = (config: PanelNavConfig): PanelNavModel => {
  const context = useContext()
  const nav = useNavigate()
  const location: Location<ClientRoute> = context.router().useLocation()

  const state = location.state as ClientRoute | null
  const pathname = location.pathname

  return useMemo(() => {
    const sections = config.sections
      .filter(section => section.hidden !== true)
      .map(section => ({ ...section, items: visibleItems(section) }))

    const pathOf = (alias: string): string | null => {
      try {
        return normalizePath(context.entrypoint<ClientEntrypoint<string>>(alias).getPath())
      } catch {
        // An alias the app never elevated addresses nothing — it cannot be the current screen,
        // and it must not take the menu down with it.
        return null
      }
    }

    const all = sections.flatMap(section => section.items)

    let current: string | null = state?.alias ?? null
    if (current == null) {
      const here = normalizePath(pathname)
      const exact = all.find(item => pathOf(item.alias) === here)
      if (exact != null) {
        current = exact.alias
      } else {
        // Longest prefix: a detail screen under a listed one still belongs to its section.
        const prefixed = all
          .map(item => ({ item, path: pathOf(item.alias) }))
          .filter((entry): entry is { item: PanelNavItem, path: string } =>
            entry.path != null && entry.path !== '/' && here.startsWith(`${entry.path}/`))
          .sort((a, b) => b.path.length - a.path.length)[0]
        current = prefixed?.item.alias ?? null
      }
    }

    const sectionOf = (alias: string | null): PanelNavSection | null =>
      alias == null ? null : sections.find(section => section.items.some(item => item.alias === alias)) ?? null

    let active = sectionOf(current)
    if (active == null && current != null) {
      // The current screen is not listed anywhere — walk up to the ancestor that is, so a
      // nested screen keeps its section (and its side menu) rather than clearing the chrome.
      let alias: string | null = current
      const seen = new Set<string>()
      while (alias != null && !seen.has(alias)) {
        seen.add(alias)
        try {
          alias = context.entrypoint<ClientEntrypoint<string>>(alias).getParentAlias() ?? null
        } catch {
          alias = null
        }
        const found = sectionOf(alias)
        if (found != null) {
          active = found
          break
        }
      }
    }

    const isItemActive = (item: PanelNavItem): boolean => item.alias === current
    const isSectionActive = (section: PanelNavSection): boolean =>
      active != null && section.name === active.name

    return {
      sections,
      current,
      active,
      showSide: active != null && active.items.length > 1,
      isSectionActive,
      isItemActive,
      goSection: section => {
        const first = section.items[0]
        return first != null ? nav.press(first.alias) : () => {}
      },
      goItem: item => nav.press(item.alias),
      hrefOf: target => {
        const alias = 'alias' in target ? target.alias : target.items[0]?.alias
        if (alias == null) {
          return undefined
        }
        const path = pathOf(alias)

        return path == null || path.includes(':') ? undefined : path
      },
    }
  }, [config, pathname, state?.alias, context, nav])
}
