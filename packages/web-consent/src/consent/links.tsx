import type { FC } from 'react'
import { webConsentUtils } from '../lib/utils.js'
import { LINK } from './consts.local.js'
import type { ConsentLinksProps } from './types.local.js'

/**
 * The policy link and the host's other links (privacy, terms), as a row of 44px targets under the
 * text — never inline in a sentence, where a translation would have to keep a link's words intact.
 * Each opens in a new tab: the visitor reads the policy without losing the question they are being
 * asked.
 */
export const ConsentLinks: FC<ConsentLinksProps> = ({ t, policyHref, links, className }) =>
  policyHref == null && (links == null || links.length === 0)
    ? null
    : <div className={webConsentUtils.cn('flex flex-wrap gap-x-4 text-[13px] text-muted-foreground', className)} data-consent-links>
      {policyHref != null && <a
        href={policyHref} target="_blank" rel="noopener noreferrer" className={LINK}
      >{t('policyLink', 'Cookie Policy')}</a>}
      {links?.map(link => <a
        key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={LINK}
      >{t(link.labelKey, link.defaultLabel)}</a>)}
    </div>
