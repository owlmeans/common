import { useRef } from 'react'
import type { FC, MouseEvent } from 'react'
import { useNavigate } from '@owlmeans/client'
import { defaultNavTranslate } from '@owlmeans/client-panel'
import { cn } from '../../@/lib/utils.js'
import { Footer } from '../footer/component.js'

import { MobileNav } from './mobile.js'
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
 * Invisible until it takes focus, then a pill in the top-left corner above everything — the
 * inverse of the page's own surface (`bg-foreground text-background`), so it reads on any theme.
 *
 * The padding is focus-only: `sr-only` zeroes padding, but a plain `px-4` sorts after it and wins,
 * which leaves a 32px box behind the clip instead of the 1px one assistive tech expects.
 */
const SKIP_LINK = [
  'sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-3',
  'rounded-full bg-foreground text-sm font-semibold text-background',
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2',
  'focus-visible:ring-offset-background',
].join(' ')

/**
 * The standard two-layer application shell.
 *
 * A layout entrypoint binds a component that renders this and nothing else — the screen
 * arrives as `children`. The side menu is mounted twice on purpose: one column for wide
 * viewports and one strip for narrow ones. Both render only when the active section has
 * more than one screen, so the single-screen case costs nothing but the elements' absence.
 *
 * `mobileMenu` swaps the narrow viewport's navigation for a menu button and a sheet holding
 * both levels: the section menu hides below `md`, and the strip is not mounted at all, because
 * the sheet already lists the screens it would show. Wide viewports are unaffected either way.
 *
 * The skip link comes FIRST in the root, ahead of the header — the first thing a keyboard reaches
 * — and moves focus to `<main id="main">`, past the brand, the menus and the actions.
 */
export const NavLayout: FC<NavLayoutProps> = ({
  nav, translate = defaultNavTranslate, title, home, actions, footer, children, className, style,
  headerClassName, contentClassName, containerClassName, mobileMenu = false, skipLinkLabel,
  themeToggle
}) => {
  const navigator = useNavigate()
  // The switcher's names go through `translate` like every other shell string, with the caller's
  // own labels winning; `false`/absent stays absent, so the footer renders exactly as it did.
  const toggle = themeToggle == null || themeToggle === false ? undefined : {
    labels: {
      toLight: (themeToggle === true ? undefined : themeToggle.labels?.toLight)
        ?? translate('shell.toLight', 'Switch to light mode'),
      toDark: (themeToggle === true ? undefined : themeToggle.labels?.toDark)
        ?? translate('shell.toDark', 'Switch to dark mode'),
    },
  }
  const toggleProp = toggle != null ? { themeToggle: toggle } : {}
  const main = useRef<HTMLElement>(null)
  const skipLabel = skipLinkLabel === false
    ? null
    : skipLinkLabel ?? translate('shell.skip', 'Skip to content')
  // Focus is moved by hand rather than left to the fragment navigation `href="#main"` would
  // perform: that changes the location, and the router reads a location change as navigation.
  // The `href` stays so the link is a link — focusable, announced, and working without script.
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    main.current?.focus()
  }
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
      * Before `header`, never inside it: `header`'s own first `div` is the shared-rhythm row a
      * position-based query locates, and a skip link is not part of any row.
      */}
    {skipLabel != null && <a href="#main" onClick={skip} data-skip-link className={SKIP_LINK}>{skipLabel}</a>}
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
        <TopNav
          config={nav} translate={translate} ariaLabel="Sections"
          className={mobileMenu ? 'hidden md:flex' : undefined}
        />
        {/*
          * The menu button goes INTO the actions row, after the actions, rather than being a
          * sibling of it: the row is what `ml-auto` pushes to the far edge, and the actions — a
          * "Get started" button, a sign-in link — have to stay visible at every width beside it.
          */}
        <div className="ml-auto flex items-center gap-2">
          {actions}
          {mobileMenu && <MobileNav config={nav} translate={translate} ariaLabel="Sections" className="md:hidden" />}
        </div>
      </div>
      {!mobileMenu && <SideNav config={nav} translate={translate} variant="bar" ariaLabel="Screens" className="md:hidden" />}
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
      {/*
        * `tabIndex={-1}` makes the skip link's target focusable by script without putting it in
        * the tab order. With the skip link disabled the id is not claimed either: an application
        * that renders its own skip link owns its own `#main`, and two elements must not share it.
        */}
      <main
        ref={main}
        {...(skipLabel != null ? { id: 'main', tabIndex: -1 } : {})}
        className={cn('flex-1 py-8 outline-none', contentClassName)}
      >
        <div className={cn(container)}>{children}</div>
      </main>
    </div>
    {/*
      * The footer is rendered unconditionally, `footer` prop or not: `Footer` itself renders the
      * platform/owner credit line even when there are no links and no children, and only that
      * component gets to decide there is nothing to show. Gating this on `footer` used to make
      * the credit disappear from every layout that never passed one.
      *
      * A NODE footer goes in as `content`, not as children: children join the centred link row,
      * which squeezes an application's own footer layout (a brand, a description, link columns)
      * into a shrink-wrapped, centred line. `content` is a full-width block on the shell's rhythm.
      */}
    {Array.isArray(footer)
      ? <Footer links={footer} translate={translate} containerClassName={container} {...toggleProp} />
      : footer != null
        ? <Footer containerClassName={container} content={footer} {...toggleProp} />
        : <Footer containerClassName={container} {...toggleProp} />}
  </div>
}
