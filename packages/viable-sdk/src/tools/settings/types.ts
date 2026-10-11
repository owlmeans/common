import type {
  ConnectBrandingCredit, ConnectConfigScope, ConnectOrganizationBranding, ConnectProjectBranding,
  ConnectProjectBrandingSave, ConnectTarget,
} from '@owlmeans/viable-common'
import type { ProjectSetting } from '../types.js'

/**
 * A project's settings — the copyright line, the organization, the legal links, the Google tag, the
 * platform credit — and the organization's defaults they start from.
 */
export interface SettingsHelper {
  /** The setting a wire field names, if it is one. */
  projectSettingOf: (key: string) => ProjectSetting | undefined
  /**
   * The patch a tool call asks for: every setting it named, and nothing it did not.
   *
   * Trimmed, because surrounding whitespace is a typing accident rather than a value. An EMPTY string
   * is kept — for the Google tag that is how the tag is removed, and for the others it is a value the
   * platform refuses with the rule, which is the right answer to a parent that sent one.
   */
  settingsPatch: (args: Record<string, unknown>) => ConnectProjectBrandingSave
  /**
   * The settings as a parent reads them, ending in the next valid action like every domain status.
   *
   * A relative link is annotated rather than left bare: `/terms` reads like a value somebody forgot
   * to finish, and a parent that "fixed" it into an absolute address would point a project's legal
   * links away from the pages the platform generated for it. The credit line says what is delivered
   * and, where it differs, what was asked for and why — a lapsed plan shows the credit while keeping
   * the request.
   */
  renderProjectSettings: (projectId: string, settings: ConnectProjectBranding, scope?: ConnectConfigScope) => string
  /** The platform credit in one line: shown or hidden, and what the plan allows. */
  creditLine: (credit: ConnectBrandingCredit) => string
  /** The organization's defaults, ending in the next valid actions. */
  renderOrganizationBranding: (branding: ConnectOrganizationBranding) => string
  /**
   * Where a saved change shows, said once for every tool that needs it.
   *
   * The platform applies an owner's change to the PREVIEW by a configuration push, which rebuilds it
   * — for a local project that push is the `.env` this connector writes, and nothing is published.
   * Production is never changed by a save of the preview's set; a save of production's own set
   * (`scope: production`) is taken at the next Publish.
   */
  settingsReach: (target: ConnectTarget, scope?: ConnectConfigScope) => string
}
