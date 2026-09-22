import { useId, useState } from 'react'
import type { FC, MouseEvent } from 'react'
import { MenuIcon, XIcon } from 'lucide-react'
import { defaultNavTranslate, resolveNavLabel, usePanelNav } from '@owlmeans/client-panel'
import { cn } from '../../@/lib/utils.js'
import { Button } from '../../@/components/ui/button.js'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '../../@/components/ui/sheet.js'

import type { MobileNavProps } from './types.js'

/**
 * A 44px target and a ring that is actually visible: the shadcn button draws its focus ring at
 * half the ring colour's alpha, which on a white header is close to nothing, and a menu button is
 * the one control a keyboard user on a narrow window has to find before anything else.
 */
const TARGET = 'size-11 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * Sheet entries are LINKS, exactly as the section menu's are — a real `href` keeps each one
 * focusable, openable in a new tab and announced as a link — and each row is a 44px touch target.
 */
const ENTRY = [
  'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground',
  'hover:bg-accent hover:text-accent-foreground',
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
].join(' ')

const ENTRY_ACTIVE = 'bg-accent text-accent-foreground'

/**
 * Both navigation levels behind one menu button — what a narrow viewport gets instead of the
 * section menu.
 *
 * The sheet lists every section; a section holding more than one screen lists its screens under
 * the section's name, and a single-screen section is one link carrying the section's own label —
 * the same rule the side menu follows, so a destination never appears twice. Labels resolve
 * exactly as `TopNav` and `SideNav` resolve theirs (`nav.<section>`, `modules.<alias>`), through
 * the same `translate` prop.
 *
 * Pressing an entry navigates in-app AND closes the sheet. Both happen in the anchor's own click
 * handler: the `preventDefault()` that stops a full page load is not something a dialog notices,
 * so a sheet left to close itself would stay open over the screen it just navigated to.
 *
 * `className` and `style` land on the TRIGGER — the only element the sheet places in the host's
 * flow; the sheet itself is portalled to the document body.
 */
export const MobileNav: FC<MobileNavProps> = (
  { config, translate = defaultNavTranslate, ariaLabel, className, style }
) => {
  const model = usePanelNav(config)
  const [open, setOpen] = useState(false)
  const id = useId()

  if (model.sections.length < 1) {
    return null
  }

  // Keys outside the `nav.` family on purpose: `nav.<name>` addresses a SECTION, and an
  // application is free to have a section called `menu`.
  const label = translate('shell.menu', 'Menu')
  const closeLabel = translate('shell.close', 'Close')

  const follow = (go: () => void) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    setOpen(false)
    go()
  }

  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>
      <Button
        variant="ghost" size="icon" aria-label={label} data-nav-menu-trigger
        className={cn(TARGET, className)} style={style}
      ><MenuIcon className="size-6" aria-hidden="true" /></Button>
    </SheetTrigger>
    {/*
      * `text-foreground` beside the primitive's `bg-background`: the sheet is portalled to the
      * document body, so it inherits nothing from the shell and states both halves of its surface
      * itself — the same rule the header follows.
      *
      * No description, deliberately: the title names the dialog, and Radix only warns about a
      * missing one unless `aria-describedby` is passed explicitly as undefined.
      */}
    <SheetContent
      side="right" showCloseButton={false} aria-describedby={undefined} data-nav-sheet
      className="gap-0 p-0 text-foreground"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b pl-4 pr-2">
        <SheetTitle className="text-base">{label}</SheetTitle>
        <SheetClose asChild>
          <Button variant="ghost" size="icon" aria-label={closeLabel} className={TARGET}>
            <XIcon className="size-5" aria-hidden="true" />
          </Button>
        </SheetClose>
      </div>
      <nav aria-label={ariaLabel} className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-1">
          {model.sections.map(section => {
            const sectionLabel = resolveNavLabel(translate, section.label, `nav.${section.name}`, section.name)

            if (section.items.length > 1) {
              const heading = `${id}-${section.name}`

              return <li key={section.name} className="pt-2">
                <p
                  id={heading}
                  className={cn(
                    'px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                    model.isSectionActive(section) && 'text-foreground'
                  )}
                >{sectionLabel}</p>
                <ul aria-labelledby={heading} className="flex flex-col gap-1">
                  {section.items.map(item => {
                    const active = model.isItemActive(item)

                    return <li key={item.alias}>
                      <a
                        href={model.hrefOf(item)}
                        onClick={follow(model.goItem(item))}
                        aria-current={active ? 'page' : undefined}
                        className={cn(ENTRY, active && ENTRY_ACTIVE)}
                      >
                        {item.Icon != null ? <item.Icon className="size-4" /> : null}
                        {resolveNavLabel(translate, item.label, `modules.${item.alias}`, item.alias)}
                      </a>
                    </li>
                  })}
                </ul>
              </li>
            }

            const active = model.isSectionActive(section)

            return <li key={section.name}>
              <a
                href={model.hrefOf(section)}
                onClick={follow(model.goSection(section))}
                aria-current={active ? 'page' : undefined}
                className={cn(ENTRY, active && ENTRY_ACTIVE)}
              >{sectionLabel}</a>
            </li>
          })}
        </ul>
      </nav>
    </SheetContent>
  </Sheet>
}
