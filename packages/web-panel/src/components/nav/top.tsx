import type { FC } from 'react'
import { defaultNavTranslate, resolveNavLabel, usePanelNav } from '@owlmeans/client-panel'
import { cn } from '@/lib/utils'
import {
  NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList
} from '@/components/ui/navigation-menu'

import type { TopNavProps } from './types.js'

/**
 * Section entries are LINKS, not buttons.
 *
 * The shadcn primitive styles its links as menu tiles — a filled hover/active background, a
 * radius and tile padding — which reads as a row of buttons across the top of an application.
 * These classes land after the primitive's, so `cn`'s tailwind-merge drops the conflicting
 * ones; every neutralised utility here has a counterpart in the primitive, and removing one
 * brings the tile back.
 */
const SECTION_LINK = [
  'bg-transparent hover:bg-transparent focus:bg-transparent',
  'rounded-none px-0 py-1',
  'text-sm font-medium text-muted-foreground',
  'hover:text-foreground hover:underline underline-offset-4',
  // Radix marks the active link with a VALUELESS `data-active`, so the state has to be matched
  // on the attribute's presence. `data-[active=true]` — which the shadcn primitive itself uses —
  // matches nothing here, which is why its own active styling never showed either.
  'data-[active]:text-foreground data-[active]:underline data-[active]:bg-transparent',
  'cursor-pointer',
].join(' ')

/**
 * The first navigation level — one entry per section.
 *
 * Pressing a section goes to its first screen; the side menu then offers the rest. The
 * viewport is off because no section opens a panel: these are links, not dropdowns.
 */
export const TopNav: FC<TopNavProps> = ({ config, translate = defaultNavTranslate, ariaLabel, className, style }) => {
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
          >{resolveNavLabel(translate, section.label, `nav.${section.name}`, section.name)}</NavigationMenuLink>
        </NavigationMenuItem>
      })}
    </NavigationMenuList>
  </NavigationMenu>
}
