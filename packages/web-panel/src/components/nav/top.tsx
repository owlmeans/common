import type { FC } from 'react'
import { usePanelNav, navLabelHelper } from '@owlmeans/client-panel'
import { cn } from '../../@/lib/utils.js'
import {
  NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList
} from '../../@/components/ui/navigation-menu.js'

import type { TopNavProps } from './types.js'
import { SECTION_LINK } from './consts.local.js'

/**
 * The first navigation level — one entry per section.
 *
 * Pressing a section goes to its first screen; the side menu then offers the rest. The
 * viewport is off because no section opens a panel: these are links, not dropdowns.
 */
export const TopNav: FC<TopNavProps> = ({ config, translate = navLabelHelper.defaultNavTranslate, ariaLabel, className, style }) => {
  const model = usePanelNav(config)

  if (model.sections.length < 1) {
    return null
  }

  return <NavigationMenu viewport={false} aria-label={ariaLabel} className={className} style={style}>
    <NavigationMenuList className="flex-wrap gap-4">
      {model.sections.map(section => {
        const go = model.goSection(section)

        return <NavigationMenuItem key={section.name}>
          <NavigationMenuLink
            active={model.isSectionActive(section)}
            // A real `href` keeps the entry focusable and openable in a new tab; the click is
            // still handled in-app, so the browser never reloads the whole application.
            href={model.hrefOf(section)}
            onClick={event => { event.preventDefault(); go() }}
            className={cn(SECTION_LINK)}
          >{navLabelHelper.resolveNavLabel(translate, section.label, `nav.${section.name}`, section.name)}</NavigationMenuLink>
        </NavigationMenuItem>
      })}
    </NavigationMenuList>
  </NavigationMenu>
}
