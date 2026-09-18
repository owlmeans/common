import type { FC } from 'react'
import { useNavigate } from '@owlmeans/client'
import { cn } from '../../@/lib/utils.js'
import { Footer } from '../footer/component.js'

import { SideNav } from './side.js'
import { TopNav } from './top.js'
import type { NavLayoutProps } from './types.js'

/**
 * The horizontal rhythm of the whole page, applied identically to the header row, the content
 * and the footer row.
 *
 * It lives in ONE constant because the three regions have to agree: a content area with its own
 * width sits visibly inset from a full-width header, which reads as a mistake rather than as a
 * design. Adjust it through `containerClassName`, which is MERGED over this — never by giving
 * the content a width of its own.
 */
const CONTAINER = 'mx-auto w-full max-w-6xl px-4'

/**
 * The standard two-layer application shell.
 *
 * A layout entrypoint binds a component that renders this and nothing else — the screen
 * arrives as `children`. The side menu is mounted twice on purpose: one column for wide
 * viewports and one strip for narrow ones. Both render only when the active section has
 * more than one screen, so the single-screen case costs nothing but the elements' absence.
 */
export const NavLayout: FC<NavLayoutProps> = ({
  nav, translate, title, home, actions, footer, children, className, style,
  headerClassName, contentClassName, containerClassName
}) => {
  const navigator = useNavigate()
  const brandAlias = home ?? nav.sections.find(section => section.items.length > 0)?.items[0]?.alias
  // MERGED over the default, never substituted for it. `containerClassName` is how a design
  // adjusts ONE aspect of the rhythm — almost always the width — and a caller passing
  // `max-w-[1280px]` means "wider", not "no padding and no centring". Substituting dropped
  // `px-4` and `mx-auto` along with the width it replaced, which is a page whose header,
  // content and footer all run flush to the window edge. tailwind-merge keeps the override
  // winning on the utility it names and leaves the rest of the rhythm standing, so a width-only
  // value stays a width-only change; `px-8` still overrides the padding when that is the intent.
  const container = cn(CONTAINER, containerClassName)

  return <div
    className={cn('flex min-h-screen flex-col bg-background text-foreground', className)}
    style={style}
  >
    {/*
      * The header is a SURFACE, and it states both halves of one.
      *
      * It has to paint an opaque background — it is sticky, and content scrolls underneath —
      * which makes it a different surface from the root behind it. A colour set on the root
      * (`className="bg-secondary text-secondary-foreground"`, a dark application shell) then
      * inherits INTO this bar while its own `bg-background` stays put, and every child that
      * states no colour of its own — the brand, a ghost-variant action button — is painted in
      * the foreground of a surface it is not on. That is light-on-light, it raises nothing at
      * build or run time, and it is invisible only to whoever opens the page.
      *
      * `text-foreground` is what stops the inheritance at the boundary. It is not decoration
      * and it is not redundant with the root: pairing has to be restated by every element that
      * repaints its own background. `headerClassName` lands after it, so an app that wants a
      * dark bar overrides BOTH halves through tailwind-merge.
      *
      * The `data-nav-backdrop` layer underneath is what keeps that promise even when
      * `headerClassName` does NOT: a restyle that hands it an invalid Tailwind v4 arbitrary-value
      * class (`bg-[--x]`, dropped silently), a bare `bg-transparent`, or a translucent surface
      * (`bg-x/50`) used to leave the sticky bar with no background paint at all, and page content
      * scrolled visibly through the menu. `-z-10` keeps it behind everything `header` renders and
      * `pointer-events-none` keeps it out of the way of clicks; it paints `bg-background` no
      * matter what `headerClassName` does or fails to do, and a caller who genuinely wants a dark
      * bar still gets it because `headerClassName`'s own background paints OVER this one.
      */}
    <header className={cn('sticky top-0 z-40 isolate border-b bg-background text-foreground', headerClassName)}>
      <div className={cn('flex h-14 items-center gap-6', container)}>
        {title != null ? <a
          onClick={brandAlias != null ? navigator.press(brandAlias) : undefined}
          className={cn('brand flex items-center gap-2 text-lg font-semibold', brandAlias != null && 'cursor-pointer')}
        >{title}</a> : null}
        <TopNav config={nav} translate={translate} ariaLabel="Sections" />
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      <SideNav config={nav} translate={translate} variant="bar" ariaLabel="Screens" className="md:hidden" />
      {/*
        * Last in source order, not first — `header`'s own FIRST `div` child is what the layout
        * test locates to measure the shared rhythm (`header > div`, `.first()`), and this element
        * is not part of that rhythm. Negative z-index inside `header`'s own `isolate` stacking
        * context paints a layer behind every normal-flow child regardless of where it sits in the
        * DOM, so moving it here changes nothing about what is visible — only which `div` a
        * position-based query finds first.
        */}
      <div aria-hidden="true" data-nav-backdrop className="absolute inset-0 -z-10 bg-background pointer-events-none" />
    </header>
    <div className="flex flex-1">
      <SideNav config={nav} translate={translate} variant="side" ariaLabel="Screens" className="hidden md:block" />
      <main className={cn('flex-1 py-8', contentClassName)}>
        <div className={cn(container)}>{children}</div>
      </main>
    </div>
    {/*
      * The footer is rendered unconditionally, `footer` prop or not: `Footer` itself renders the
      * platform/owner credit line even when there are no links and no children, and only that
      * component gets to decide there is nothing to show. Gating this on `footer` used to make
      * the credit disappear from every layout that never passed one.
      */}
    {Array.isArray(footer)
      ? <Footer links={footer} translate={translate} containerClassName={container} />
      : footer != null
        ? <Footer containerClassName={container}>{footer}</Footer>
        : <Footer containerClassName={container} />}
  </div>
}
