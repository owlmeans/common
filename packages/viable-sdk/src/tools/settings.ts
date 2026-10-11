import { ConnectTarget, WorkloadKind, type ConnectBrandingCredit, type ConnectConfigScope, type ConnectOrganizationBranding, type ConnectProjectBranding, type ConnectProjectBrandingSave } from '@owlmeans/viable-common'
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

  const creditLine = (credit: ConnectBrandingCredit): string => {
    if (credit.hidden) return 'platform credit: hidden (white label)'
    if (credit.requested) {
      return 'platform credit: shown — hiding it was asked for, and it is hidden again on its own once the'
        + ' plan includes white label'
    }

    return credit.entitled
      ? 'platform credit: shown · the plan allows hiding it (set_platform_credit)'
      : 'platform credit: shown · hiding it needs a plan with white label'
  }

  const renderProjectSettings = (
    projectId: string, settings: ConnectProjectBranding, scope?: ConnectConfigScope,
  ): string => [
    `settings of ${projectId}${scope === WorkloadKind.Production ? ' · production (taken at the next Publish)' : ''}`,
    ...PROJECT_SETTINGS.map(setting => settingLine(setting, settings[setting.key] ?? '')),
    ...(settings.credit != null ? [creditLine(settings.credit)] : []),
    'next: update_project_settings to change any of them'
      + (settings.credit != null ? '; set_platform_credit hides or shows the credit' : ''),
  ].join('\n')

  const renderOrganizationBranding = (branding: ConnectOrganizationBranding): string => [
    'organization defaults — what every new project starts with',
    `organization: ${branding.organizationName}`,
    `copyright: ${branding.copyright}`,
    'next: update_organization_branding to change them; update_project_settings with'
    + ' useOrganizationDefaults: true copies them into one project, backfill_project_branding fills'
    + ' the projects whose settings are still blank',
  ].join('\n')

  const settingsReach = (target: ConnectTarget, scope?: ConnectConfigScope): string => {
    if (scope === WorkloadKind.Production) {
      return 'This is production\'s own set: the published site takes it at the next Publish, in the web'
        + ' application; the preview is not changed.'
    }

    return target === ConnectTarget.Local
      ? 'The platform writes it into this project\'s .env through this connector; run_local builds the'
        + ' application with it.'
      : 'The preview is rebuilt with it; production takes it at the next Publish, in the web application.'
  }

  return { projectSettingOf, settingsPatch, renderProjectSettings, creditLine, renderOrganizationBranding, settingsReach }
}

export const settingsHelper = createSettingsHelper()
