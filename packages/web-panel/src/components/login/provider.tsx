import type { FC } from 'react'
import { ShieldCheck } from 'lucide-react'
import { cn } from '../../@/lib/utils.js'
import { loginProviderHelper } from '@owlmeans/client-panel/auth'
import type { LoginProviderNoteProps } from './types.js'

/**
 * Who signs the person in, and on whose behalf.
 *
 * A sign-in page that a third party runs for an application has to say so wherever the
 * application's own name appears: the relationship in a sentence, and a "More information" link.
 * Without it the page is a stranger's form wearing someone else's name — which is precisely what a
 * browser's impersonation heuristics look for.
 *
 * `top` is a full-width strip the screen renders as its FIRST child, above the card (the platform's
 * own hosts); `inline` is one line inside the card, under the methods (an owner's own domain).
 * A `role="note"` block, never `header`/`nav`: it is a disclosure, not page chrome, and a screen
 * that grew a landmark here would be read as a second banner.
 *
 * The names are put in after translation (`loginProviderHelper.fill`), so word order stays the
 * translator's and nothing but plain text ever reaches the markup.
 */
export const LoginProviderNote: FC<LoginProviderNoteProps> = ({ model, translate, className }) => {
  const top = model.placement === 'top'
  const sentence = top
    ? translate('login.provider.top', 'This app is hosted by {{operator}} on behalf of {{product}}. You sign in with {{provider}}.')
    : translate('login.provider.inline', 'Sign-in is provided by {{provider}} on behalf of {{product}}.')

  return <div
    role="note"
    data-login-provider
    data-placement={model.placement}
    // The strip's full width is inline for the same reason the screen's height is: it is the part
    // of the layout a stale `@source` scan must never be able to drop.
    style={top ? { width: '100%', boxSizing: 'border-box' } : undefined}
    className={cn(
      'flex items-start justify-center gap-2 text-center text-xs text-muted-foreground',
      top && 'border-b bg-muted px-4 py-2',
      className
    )}
  >
    <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
    <span>
      {loginProviderHelper.fill(sentence, model)}
      {model.info != null && <>
        {' '}
        <a
          data-login-provider-info
          href={model.info} target="_blank" rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {translate('login.provider.more', 'More information')}
        </a>
      </>}
    </span>
  </div>
}
