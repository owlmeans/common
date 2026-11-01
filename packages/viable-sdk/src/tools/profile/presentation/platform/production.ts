import { presentReadHelper as read } from './read.js'
import type { ProductionPresentHelper } from './types.js'

export const createProductionPresentHelper = (): ProductionPresentHelper => {
  /**
   * The custom domain with the DNS records the person creates — until it is linked, exactly as the
   * text lists them: the traffic CNAME and the certificate's delegation, each with the provider's word.
   */
  const domainOf = (value: unknown): Record<string, unknown> | null => {
    const domain = read.recordOrNull(value)
    if (domain == null) return null
    const customDomain = read.maybeText(domain.customDomain)
    const status = read.text(domain.status, 'none')
    const records: Array<Record<string, unknown>> = []
    if (customDomain != null && status !== 'linked') {
      const target = read.maybeText(domain.cnameTarget)
      if (target != null) {
        records.push(read.compact({
          type: 'CNAME', name: customDomain, value: target, purpose: 'traffic',
          providerStatus: read.maybeText(domain.hostnameStatus),
        }))
      }
      const dcvName = read.maybeText(domain.dcvName)
      const dcvValue = read.maybeText(domain.dcvValue)
      if (dcvName != null && dcvValue != null) {
        records.push(read.compact({
          type: 'CNAME', name: dcvName, value: dcvValue, purpose: 'certificate',
          providerStatus: read.maybeText(domain.sslStatus),
        }))
      }
    }

    return read.compact({
      generatedHost: read.text(domain.generatedHost),
      customDomain,
      status,
      verified: read.day(domain.verifiedAt),
      records,
      message: read.warning(domain.message),
    })
  }

  /** The address the site answers on: the custom domain once linked, else its generated host. */
  const siteUrl = (domain: Record<string, unknown> | null): string | undefined =>
    domain?.customDomain != null && domain.status === 'linked'
      ? read.url(domain.customDomain)
      : read.url(domain?.generatedHost)

  const status = read.total((structured, args) => {
    const domain = domainOf(structured.domain)
    const site = read.workload(structured.workload)

    return {
      projectId: read.project(structured, args),
      site: site != null ? read.compact({ ...site, url: siteUrl(domain) ?? site.url }) : null,
      domain,
    }
  })

  const domain = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    domain: domainOf(structured.domain),
  }))

  const auth = read.total((structured, args) => read.compact({
    projectId: read.project(structured, args),
    issuerUrl: read.text(structured.issuerUrl),
    // A public OIDC client id the person configures a self-hosted copy with; the secret is only `secretSet`.
    clientId: read.text(structured.clientId),
    secretSet: read.flag(structured.secretSet),
    redirectUris: read.texts(structured.redirectUris),
    siteUrl: read.url(read.maybeText(structured.customDomain) ?? structured.generatedHost),
  }))

  const redirects = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    redirectUris: read.texts(structured.redirectUris),
  }))

  return { status, domain, auth, redirects }
}

export const productionPresentHelper = createProductionPresentHelper()
