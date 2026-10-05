import type { ConnectProjectBranding, ConnectProjectBrandingSave, ConnectTarget } from '@owlmeans/viable-common'
import type { ProjectSetting } from '../types.js'

/** A project's settings — the copyright line, the organization, the legal links, the Google tag. */
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
   * links away from the pages the platform generated for it.
   */
  renderProjectSettings: (projectId: string, settings: ConnectProjectBranding) => string
  /**
   * Where a saved change shows, said once for both tools that need it.
   *
   * The platform applies an owner's change to the PREVIEW by a configuration push, which rebuilds it
   * — for a local project that push is the `.env` this connector writes, and nothing is published.
   * Production is never changed by a save; it takes the stored values at the next Publish.
   */
  settingsReach: (target: ConnectTarget) => string
}
