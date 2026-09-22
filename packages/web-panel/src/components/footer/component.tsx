import type { FC } from 'react'
import { defaultNavTranslate, resolveNavLabel } from '@owlmeans/client-panel'
import { cn } from '../../@/lib/utils.js'
import { Link } from '../link.js'
import { ThemeToggle } from '../scheme/toggle.js'
import { ShellCredit, useShellCredit } from './credit.js'

import type { FooterProps } from './types.js'

/**
 * The standard footer — an optional full-width `content` block, a centred row of links plus
 * whatever the app adds as children, and the platform/owner credit line, last.
 *
 * `content` is a block of the container, not an entry of the link row. The container centres its
 * children (`items-center`), which is right for a row of links and a credit line and wrong for an
 * application's own footer layout: centred, a block shrink-wraps to its content and its columns
 * collapse towards the middle. `self-stretch` takes that one child back to the container's full
 * width, and `text-start` undoes the container's centred text, so an application lays its own
 * footer out from the natural edge — while the container keeps `items-center` for everything else.
 *
 * Labels are resolved HERE and handed to `Link` as children: `Link`'s own default label
 * looks up `modules.<alias>` with no fallback, so an app without i18n would print the raw
 * key. Resolving first means a literal label, a translation, or a humanized alias — never
 * a key.
 *
 * The credit is rendered unconditionally — never behind a prop, so a restyle cannot delete it.
 * `useShellCredit` decides emptiness here (rather than letting `ShellCredit` render null inside
 * an otherwise-empty bordered strip): the footer as a whole returns `null` only when content,
 * links, children, the theme switcher AND the resolved credit are all absent.
 *
 * `themeToggle` puts the light/dark `ThemeToggle` in the bottom row beside the credit. It is the
 * footer's own row rather than something an application adds through `content`, so every area of
 * an application offers it in the same place and the credit keeps its position whatever the
 * application's own footer layout does.
 */
export const Footer: FC<FooterProps> = ({
  links, translate = defaultNavTranslate, children, content, className, style, containerClassName,
  themeToggle
}) => {
  const credit = useShellCredit()
  const hasLinks = (links != null && links.length > 0) || children != null
  const toggle = themeToggle == null || themeToggle === false
    ? null
    : themeToggle === true ? {} : themeToggle
  if (content == null && !hasLinks && toggle == null && !credit.poweredBy && credit.line == null) {
    return null
  }

  return <footer className={cn('border-t py-6', className)} style={style}>
    <div className={cn('flex flex-col items-center gap-3 text-center', containerClassName)}>
      {content != null && <div data-footer-content className="w-full self-stretch text-start">{content}</div>}
      {hasLinks && <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
        {links?.map((link, idx) => {
          const label = resolveNavLabel(
            translate, link.label, `modules.${link.alias ?? link.href ?? ''}`, link.alias ?? link.href
          )

          return link.href != null
            ? <Link key={`${link.href}:${idx}`} src={link.href} open={link.open}>{label}</Link>
            : <Link key={`${link.alias}:${idx}`} module={link.alias} open={link.open}>{label}</Link>
        })}
        {children}
      </div>}
      {/*
        * With a switcher, the credit and the switcher share the bottom row — the credit first, so
        * it is still what the footer ends on in reading order. Without one the credit stays the
        * container's own last child, exactly as it always was.
        */}
      {toggle != null
        ? <div data-footer-bottom className="flex flex-wrap items-center justify-center gap-2">
          <ShellCredit />
          <ThemeToggle {...(toggle.labels != null ? { labels: toggle.labels } : {})} />
        </div>
        : <ShellCredit />}
    </div>
  </footer>
}
