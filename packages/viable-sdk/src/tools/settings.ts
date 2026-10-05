import { ConnectTarget, type ConnectProjectBranding, type ConnectProjectBrandingSave } from '@owlmeans/viable-common'
import { PROJECT_SETTINGS } from './consts.js'
import type { ProjectSetting } from './types.js'
import type { SettingsHelper } from './settings/types.js'

export const createSettingsHelper = (): SettingsHelper => {
  const projectSettingOf = (key: string): ProjectSetting | undefined =>
    PROJECT_SETTINGS.find(setting => setting.key === key)

  const settingsPatch = (args: Record<string, unknown>): ConnectProjectBrandingSave => {
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

  const renderProjectSettings = (projectId: string, settings: ConnectProjectBranding): string => [
    `settings of ${projectId}`,
    ...PROJECT_SETTINGS.map(setting => settingLine(setting, settings[setting.key] ?? '')),
    'next: update_project_settings to change any of them',
  ].join('\n')

  const settingsReach = (target: ConnectTarget): string => target === ConnectTarget.Local
    ? 'The platform writes it into this project\'s .env through this connector; run_local builds the'
      + ' application with it.'
    : 'The preview is rebuilt with it; production takes it at the next Publish, in the web application.'

  return { projectSettingOf, settingsPatch, renderProjectSettings, settingsReach }
}

export const settingsHelper = createSettingsHelper()
