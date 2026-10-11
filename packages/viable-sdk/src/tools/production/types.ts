import type { ConnectProductionAuth, ConnectProductionDomain, ConnectProductionStatus } from '@owlmeans/viable-common'

/** How the production tools put the platform's answers into words. */
export interface ProductionToolHelper {
  /**
   * The production workload — its status and address, or that it was never published — then its
   * custom domain in one line, and what to do next.
   */
  renderStatus: (status: ConnectProductionStatus) => string
  /**
   * A custom domain: its status, and — until it is active — the two DNS records the owner creates at
   * their DNS provider, each with the provider's own state of it, and what to do next.
   */
  renderDomain: (domain: ConnectProductionDomain | null) => string
  /**
   * The standalone sign-in configuration a self-hosted copy uses. The client secret is never part of
   * it: only whether one is set, and where the owner reads it.
   */
  renderAuth: (auth: ConnectProductionAuth) => string
  /** The stored redirect addresses after a replace, and when they apply. */
  renderRedirects: (redirectUris: string[]) => string
}
