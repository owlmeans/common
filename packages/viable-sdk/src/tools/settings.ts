import { ConnectTarget } from '@owlmeans/viable-common'
import type { ConnectProjectBranding, ConnectProjectBrandingSave } from '@owlmeans/viable-common'

/**
 * One project setting, as a parent agent reads and writes it.
 *
 * `rule` is what the PLATFORM accepts, stated in words: the connector never checks a value itself,
 * because a second copy of the web save's validation is a second answer that drifts from the first.
 * The same words are used by the tool's description and by the refusal a rejected value comes back
 * as, so a parent is told the rule before it tries and again, for the one field, when it broke it.
 */
export interface ProjectSetting {
  key: keyof ConnectProjectBranding
  /** How a status line names it. */
  label: string
  rule: string
}

/** The project settings a connector reaches, in the order the control panel shows them. */
export const PROJECT_SETTINGS: readonly ProjectSetting[] = [
  {
    key: 'copyright', label: 'copyright',
    rule: 'a line of text such as "© 2026 Acme Ltd", never empty',
  },
  {
    key: 'organizationName', label: 'organization',
    rule: 'the name of whoever runs the application, never empty',
  },
  {
    key: 'termsUrl', label: 'terms',
    rule: 'an https:// address with no user or password in it, or a path on the application itself'
      + ' starting with a single slash — /terms is the generated Terms page',
  },
  {
    key: 'privacyUrl', label: 'privacy',
    rule: 'an https:// address with no user or password in it, or a path on the application itself'
      + ' starting with a single slash — /privacy is the generated Privacy page',
  },
  {
    key: 'googleTag', label: 'google tag',
    rule: 'a Google tag id — GTM-…, G-…, GT-…, AW-… or DC-… — or an empty string to remove it',
  },
]

/** The setting a wire field names, if it is one. */
export const projectSettingOf = (key: string): ProjectSetting | undefined =>
  PROJECT_SETTINGS.find(setting => setting.key === key)

/**
 * The patch a tool call asks for: every setting it named, and nothing it did not.
 *
 * Trimmed, because surrounding whitespace is a typing accident rather than a value. An EMPTY string
 * is kept — for the Google tag that is how the tag is removed, and for the others it is a value the
 * platform refuses with the rule, which is the right answer to a parent that sent one.
 */
export const settingsPatch = (args: Record<string, unknown>): ConnectProjectBrandingSave => {
  const patch: Record<string, string> = {}
  for (const { key } of PROJECT_SETTINGS) {
    const value = args[key]
    if (typeof value === 'string') patch[key] = value.trim()
  }

  return patch as ConnectProjectBrandingSave
}

/** What a stored link is, where the address alone does not say. */
const linkNote = (value: string): string => {
  if (value === '/terms') return ' — the generated Terms page'
  if (value === '/privacy') return ' — the generated Privacy page'

  return value.startsWith('/') ? ' — a page of the application itself' : ''
}

const settingLine = (setting: ProjectSetting, value: string): string => {
  if (setting.key === 'googleTag') {
    return value === ''
      ? `${setting.label}: none`
      : `${setting.label}: ${value} · behind the cookie consent (Consent Mode v2)`
  }
  if (value === '') return `${setting.label}: (not set)`

  return `${setting.label}: ${value}${setting.key === 'termsUrl' || setting.key === 'privacyUrl' ? linkNote(value) : ''}`
}

/**
 * The settings as a parent reads them, ending in the next valid action like every domain status.
 *
 * A relative link is annotated rather than left bare: `/terms` reads like a value somebody forgot
 * to finish, and a parent that "fixed" it into an absolute address would point a project's legal
 * links away from the pages the platform generated for it.
 */
export const renderProjectSettings = (projectId: string, settings: ConnectProjectBranding): string => [
  `settings of ${projectId}`,
  ...PROJECT_SETTINGS.map(setting => settingLine(setting, settings[setting.key] ?? '')),
  'next: update_project_settings to change any of them',
].join('\n')

/**
 * Where a saved change shows, said once for both tools that need it.
 *
 * The platform applies an owner's change to the PREVIEW by a configuration push, which rebuilds it
 * — for a local project that push is the `.env` this connector writes, and nothing is published.
 * Production is never changed by a save; it takes the stored values at the next Publish.
 */
export const settingsReach = (target: ConnectTarget): string => target === ConnectTarget.Local
  ? 'The platform writes it into this project\'s .env through this connector; run_local builds the'
    + ' application with it.'
  : 'The preview is rebuilt with it; production takes it at the next Publish, in the web application.'
