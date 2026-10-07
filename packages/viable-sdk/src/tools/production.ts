import type { ConnectProductionDomain } from '@owlmeans/viable-common'
import { DOMAIN_STATUS_WORDS, PRODUCTION_STATUS_WORDS } from './consts.local.js'
import { refusalHelper } from './refusal.js'
import type { ProductionToolHelper } from './production/types.js'

export const createProductionToolHelper = (): ProductionToolHelper => {
  const addressOf = (domain: ConnectProductionDomain | null): string | null =>
    domain?.customDomain != null && domain.status === 'linked'
      ? domain.customDomain
      : domain?.generatedHost != null && domain.generatedHost !== '' ? domain.generatedHost : null

  /** The provider's own word for one record, when it said one. */
  const said = (state: string | undefined): string => state != null && state !== '' ? ` — provider: ${state}` : ''

  const renderDomain: ProductionToolHelper['renderDomain'] = domain => {
    if (domain?.customDomain == null || domain.customDomain === '') {
      return 'custom domain: none — custom_domain { action: attach, domain } attaches one'
        + (domain?.generatedHost != null && domain.generatedHost !== '' ? `; the site answers on ${domain.generatedHost}` : '')
        + '.'
    }
    const lines = [`custom domain ${domain.customDomain}: ${DOMAIN_STATUS_WORDS[domain.status] ?? domain.status}`]
    if (domain.status === 'linked') {
      lines.push(`The site answers on https://${domain.customDomain}; ${domain.generatedHost} keeps serving too.`)

      return lines.join('\n')
    }
    const records = [
      ...(domain.cnameTarget != null && domain.cnameTarget !== ''
        ? [`  CNAME ${domain.customDomain} → ${domain.cnameTarget} (the traffic${said(domain.hostnameStatus)})`] : []),
      ...(domain.dcvName != null && domain.dcvName !== '' && domain.dcvValue != null && domain.dcvValue !== ''
        ? [`  CNAME ${domain.dcvName} → ${domain.dcvValue} (the certificate${said(domain.sslStatus)})`] : []),
    ]
    if (records.length > 0) {
      lines.push('The user creates these DNS records at the domain\'s DNS provider:', ...records)
    }
    if (domain.message != null && domain.message !== '') {
      lines.push(`the provider said: ${refusalHelper.refusalPhrase(domain.message)}`)
    }
    lines.push('next: once the records are in place, custom_domain { action: verify } asks the provider again;'
      + ' DNS can take minutes to hours to reach it.')

    return lines.join('\n')
  }

  const renderStatus: ProductionToolHelper['renderStatus'] = ({ workload, domain }) => {
    if (workload == null) {
      return 'Not published yet — publish_production builds the current sources and deploys them as the'
        + ' production site (with the user\'s agreement, confirm: true).'
    }
    const address = addressOf(domain)
    const lines = [
      `production: ${PRODUCTION_STATUS_WORDS[workload.status] ?? workload.status}`
      + (address != null && workload.status === 'live' ? ` · https://${address}` : ''),
    ]
    for (const warning of [workload.lastError, workload.buildWarning, workload.backendWarning]) {
      if (warning != null && warning !== '') lines.push(`warning: ${refusalHelper.refusalPhrase(warning)}`)
    }
    lines.push(renderDomain(domain))
    if (workload.status === 'building' || workload.status === 'deploying') {
      lines.push('next: production_status again in a minute — a build takes several.')
    } else if (workload.status === 'not-deployed' || workload.status === 'error') {
      lines.push('next: production_control { action: restart } brings the last published build back;'
        + ' publish_production publishes the current sources.')
    }

    return lines.join('\n')
  }

  const renderAuth: ProductionToolHelper['renderAuth'] = auth => [
    'The production sign-in (OIDC) a self-hosted copy of this project is configured with:',
    `issuer: ${auth.issuerUrl !== '' ? auth.issuerUrl : 'not provisioned yet — the first publish provisions it'}`,
    `client id: ${auth.clientId !== '' ? auth.clientId : 'not provisioned yet — the first publish provisions it'}`,
    `client secret: ${auth.secretSet
      ? 'set — never shown here; the user reads it in the OwlMeans web application (Publish → Auth)'
      : 'not set yet — the first publish provisions it'}`,
    ...(auth.customDomain != null || auth.generatedHost !== '' ? [`site: https://${auth.customDomain ?? auth.generatedHost}`] : []),
    auth.redirectUris.length > 0
      ? `the owner's own redirect addresses:\n${auth.redirectUris.map(uri => `  ${uri}`).join('\n')}`
      : 'the owner\'s own redirect addresses: none — the site\'s own address is always allowed',
    'next: set_production_redirects { redirects } replaces that list; it applies on the next publish_production.',
  ].join('\n')

  const renderRedirects: ProductionToolHelper['renderRedirects'] = redirectUris => (redirectUris.length > 0
    ? `Stored ${redirectUris.length} redirect address(es):\n${redirectUris.map(uri => `  ${uri}`).join('\n')}`
    : 'The owner\'s redirect addresses were cleared.')
    + '\nThey reach the sign-in on the next publish_production.'

  return { renderStatus, renderDomain, renderAuth, renderRedirects }
}

export const productionToolHelper = createProductionToolHelper()
