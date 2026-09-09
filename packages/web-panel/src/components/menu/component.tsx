import type { FC, ReactNode } from 'react'
import { isValidElement, useCallback, useMemo, useState } from 'react'
import { Menu } from 'lucide-react'
import { defaultNavTranslate, resolveNavLabel } from '@owlmeans/client-panel'
import type { NavTranslate } from '@owlmeans/client-panel'
import { useContext, useNavigate } from '@owlmeans/client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { PanelMenuEntryKind } from './types.js'
import type {
  PanelMenuEntry, PanelMenuItemEntry, PanelMenuProps, PanelMenuSubEntry, PanelMenuWidgetEntry,
} from './types.js'

/**
 * Drop the entries nobody asked to see, then the rules those leave behind.
 *
 * A caller composes a menu from optional blocks — a project section that only exists on a
 * project screen, an auth row that only exists while signed in — and expresses "not now" as
 * `hidden`. Filtering the entries alone leaves the separators that framed them, so the menu
 * opens onto a leading rule, a doubled rule, or a rule under the last item. Normalising here
 * rather than at every call site is the whole reason the entries are data.
 */
const usable = (entries: PanelMenuEntry[]): PanelMenuEntry[] => {
  const visible = entries.filter(entry => entry.hidden !== true)
  const kept: PanelMenuEntry[] = []
  for (const entry of visible) {
    if (entry.kind !== PanelMenuEntryKind.Separator) {
      kept.push(entry)
      continue
    }
    const previous = kept[kept.length - 1]
    if (previous != null && previous.kind !== PanelMenuEntryKind.Separator) {
      kept.push(entry)
    }
  }
  while (kept.length > 0 && kept[kept.length - 1].kind === PanelMenuEntryKind.Separator) {
    kept.pop()
  }

  return kept
}

const labelOf = (
  translate: NavTranslate,
  entry: { key: string, label?: string, labelKey?: string, alias?: string }
): string => resolveNavLabel(
  translate,
  entry.label,
  entry.labelKey ?? (entry.alias != null ? `modules.${entry.alias}` : `menu.${entry.key}`),
  entry.alias ?? entry.key
)

const renderWidget = (entry: PanelMenuWidgetEntry, className: string): ReactNode => {
  if (isValidElement(entry.render) || typeof entry.render !== 'function') {
    return entry.render as ReactNode
  }
  const Widget = entry.render

  return <Widget className={className} />
}

/**
 * The application menu — one dropdown, described as data.
 *
 * Built on the shadcn `dropdown-menu` primitive under the `@` contract: the specifier is emitted
 * verbatim and resolves to the CONSUMING app's own copy, so an app must vendor
 * `dropdown-menu.tsx` and declare `@radix-ui/react-dropdown-menu` alongside the other Radix peers.
 *
 * Entries are a closed union rather than children because every kind has different focus,
 * keyboard and close-on-select behaviour, and because the same description then serves a
 * collapsed toolbar, a header overflow and a mobile shell without any of them re-deriving it.
 */
export const PanelMenu: FC<PanelMenuProps> = ({
  entries, translate = defaultNavTranslate, trigger, triggerLabel, indicator,
  align = 'end', side, triggerClassName, contentClassName, open, onOpenChange, testId,
  className, style,
}) => {
  const context = useContext()
  const nav = useNavigate()
  const [selfOpen, setSelfOpen] = useState(false)
  const isOpen = open ?? selfOpen
  const setOpen = useCallback((next: boolean) => {
    setSelfOpen(next)
    onOpenChange?.(next)
  }, [onOpenChange])

  /**
   * The path an alias addresses, resolved SYNCHRONOUSLY.
   *
   * `Link` asks `entrypoint.url()` and settles a frame later, which is fine for a link that is
   * already on screen. A menu's content mounts at the moment it opens, so an href that arrives
   * afterwards is missing exactly while the user is reading the row: not focusable as a link,
   * not middle-clickable, no status-bar target. `path()` is a lookup against the entrypoint's own
   * declaration, so it answers immediately — and answers `undefined` for a path carrying route
   * parameters, where there is no honest URL to show yet.
   */
  const hrefOf = useMemo(() => (alias: string): string | undefined => {
    try {
      const path = context.entrypoint<ClientEntrypoint<string>>(alias).path()

      return path.includes(':') ? undefined : path
    } catch {
      // An alias the app never elevated addresses nothing. It must not take the menu down.
      return undefined
    }
  }, [context])

  const select = (entry: PanelMenuItemEntry): void => {
    entry.onSelect?.()
    if (entry.href == null && entry.alias != null) {
      nav.press(entry.alias)()
    }
  }

  const renderItem = (entry: PanelMenuItemEntry): ReactNode => {
    const external = entry.href != null
    const href = entry.href ?? (entry.alias != null ? hrefOf(entry.alias) : undefined)
    // An in-app link is the one case that cannot use Radix's `onSelect`. The anchor must call
    // `preventDefault()` or the browser performs a full page load, and Radix composes its own
    // click handler with `checkForDefaultPrevented: true` — so preventing the default also
    // cancels `onSelect`, and with it the automatic close. Both are driven explicitly below.
    // Left implicit, the row navigated nowhere and the menu stayed open.
    const inApp = !external && href != null
    const body = <>
      {entry.Icon != null ? <entry.Icon className="size-4 shrink-0" /> : null}
      <span className="flex-1 truncate">{labelOf(translate, entry)}</span>
      {entry.hint != null
        ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{entry.hint}</span>
        : null}
    </>

    // `key` stays OUT of this bag — React refuses a key arriving through a spread.
    const shared = {
      disabled: entry.disabled,
      variant: entry.variant,
      'aria-current': entry.active === true ? ('true' as const) : undefined,
      className: cn(entry.active === true && 'bg-accent text-accent-foreground'),
    }

    // A menu entry is a real link wherever it addresses something. An `<a>` without `href` is
    // not focusable, does not answer the keyboard, cannot be opened in a new tab, and does not
    // even carry the `link` role.
    return href != null
      ? <DropdownMenuItem
        key={entry.key}
        {...shared}
        onSelect={inApp ? undefined : () => select(entry)}
        asChild
      >
        <a
          href={href}
          target={external && entry.open === true ? '_blank' : undefined}
          rel={external && entry.open === true ? 'noopener noreferrer' : undefined}
          onClick={inApp
            ? event => { event.preventDefault(); select(entry); setOpen(false) }
            : undefined}
        >{body}</a>
      </DropdownMenuItem>
      : <DropdownMenuItem key={entry.key} {...shared} onSelect={() => select(entry)}>{body}</DropdownMenuItem>
  }

  const renderSub = (entry: PanelMenuSubEntry): ReactNode => <DropdownMenuSub key={entry.key}>
    <DropdownMenuSubTrigger className="gap-2">
      {entry.Icon != null ? <entry.Icon className="size-4 shrink-0" /> : null}
      <span className="flex-1 truncate">{labelOf(translate, entry)}</span>
      {entry.hint != null
        ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{entry.hint}</span>
        : null}
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent>
      {usable(entry.entries).map(nested => renderEntry(nested, true))}
    </DropdownMenuSubContent>
  </DropdownMenuSub>

  const renderEntry = (entry: PanelMenuEntry, nested = false): ReactNode => {
    switch (entry.kind) {
      case PanelMenuEntryKind.Separator:
        return <DropdownMenuSeparator key={entry.key} />
      case PanelMenuEntryKind.Label:
        return <DropdownMenuLabel key={entry.key} className="truncate text-xs text-muted-foreground">
          {labelOf(translate, entry)}
        </DropdownMenuLabel>
      case PanelMenuEntryKind.Sub:
        // One level. A dropdown that nests further is a navigation tree, not this primitive.
        return nested ? null : renderSub(entry)
      case PanelMenuEntryKind.Widget: {
        const caption = entry.label != null || entry.labelKey != null
          // Inline, the caption names a control on the same line and reads as an item's label;
          // stacked, it is a heading over the widget below it.
          ? <span className={cn(
            'shrink-0',
            entry.inline === true ? 'text-sm' : 'text-xs text-muted-foreground'
          )}>{labelOf(translate, entry)}</span>
          : null

        return <div
          key={entry.key}
          data-panel-menu-row={entry.key}
          className={cn(
            'flex min-w-0 gap-2 px-2 py-1.5 text-sm',
            entry.inline === true ? 'items-center' : 'flex-col items-stretch',
            entry.className
          )}
        >
          {caption}
          {renderWidget(entry, 'min-w-0 flex-1')}
        </div>
      }
      default:
        return renderItem(entry)
    }
  }

  const rows = usable(entries)

  return <DropdownMenu open={isOpen} onOpenChange={setOpen}>
    <DropdownMenuTrigger asChild>
      {trigger ?? <Button
        variant="outline"
        size="icon"
        aria-label={triggerLabel}
        title={triggerLabel}
        data-testid={testId}
        className={cn('relative', triggerClassName, className)}
        style={style}
      >
        <Menu className="size-4" />
        {indicator}
      </Button>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align={align} side={side} className={cn('w-72', contentClassName)}>
      {rows.map(entry => renderEntry(entry))}
    </DropdownMenuContent>
  </DropdownMenu>
}
