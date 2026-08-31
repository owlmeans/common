import type { FC } from 'react'
import { defaultNavTranslate, resolveNavLabel, usePanelNav } from '@owlmeans/client-panel'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import type { SideNavProps } from './types.js'

/**
 * The second navigation level — the screens of the active section.
 *
 * It renders NOTHING when the section holds a single screen: a menu offering the page you
 * are already on is noise. The component still exists in the tree, so a section that grows
 * a second screen gains its side menu with no layout change.
 */
export const SideNav: FC<SideNavProps> = (
  { config, translate = defaultNavTranslate, variant = 'side', ariaLabel, className, style }
) => {
  const model = usePanelNav(config)

  if (!model.showSide || model.active == null) {
    return null
  }

  const items = model.active.items.map(item => {
    const label = resolveNavLabel(translate, item.label, `modules.${item.alias}`, item.alias)

    return <Button
      key={item.alias}
      variant="ghost"
      size={variant === 'bar' ? 'sm' : 'default'}
      onClick={model.goItem(item)}
      aria-current={model.isItemActive(item) ? 'page' : undefined}
      className={cn(
        variant === 'bar' ? 'shrink-0' : 'w-full justify-start',
        model.isItemActive(item) && 'bg-accent text-accent-foreground'
      )}
    >
      {item.Icon != null ? <item.Icon className="size-4" /> : null}
      {label}
    </Button>
  })

  return variant === 'bar'
    ? <nav
      aria-label={ariaLabel}
      className={cn('flex gap-1 overflow-x-auto border-b px-2 py-1', className)}
      style={style}
    >{items}</nav>
    : <aside className={cn('w-56 shrink-0 border-r', className)} style={style}>
      <nav aria-label={ariaLabel} className="flex flex-col gap-1 p-3">{items}</nav>
    </aside>
}
