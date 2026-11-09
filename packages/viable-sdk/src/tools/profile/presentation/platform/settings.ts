import { presentReadHelper as read } from './read.js'
import type { SettingsPresentHelper } from './types.js'

export const createSettingsPresentHelper = (): SettingsPresentHelper => {
  const credit = (value: unknown): Record<string, unknown> | undefined => {
    const view = read.recordOrNull(value)

    return view == null
      ? undefined
      : { hidden: read.flag(view.hidden), requested: read.flag(view.requested), entitled: read.flag(view.entitled) }
  }

  const settings = read.total((structured, args) => {
    const view = read.record(structured.settings)

    return read.compact({
      projectId: read.project(structured, args),
      scope: read.maybeText(structured.scope),
      settings: read.compact({
        copyright: read.text(view.copyright),
        organizationName: read.text(view.organizationName),
        termsUrl: read.text(view.termsUrl),
        privacyUrl: read.text(view.privacyUrl),
        googleTag: read.text(view.googleTag),
        credit: credit(view.credit),
      }),
    })
  })

  const configuration = read.total((structured, args) => {
    const config = read.record(structured.configuration)

    return {
      projectId: read.project(structured, args),
      configuration: {
        scope: read.text(config.scope, read.text(args.scope, 'ephemeral')),
        // Only the name and whether it is set: a backend value is a secret, whatever an answer holds.
        backend: read.records(config.backend).map(variable => ({ name: read.text(variable.name), set: read.flag(variable.set) })),
        frontend: read.records(config.frontend).map(variable => ({
          name: read.text(variable.name), set: read.flag(variable.set), value: read.text(variable.value),
        })),
      },
    }
  })

  const organization = read.total(structured => {
    const branding = read.record(structured.organization)

    return {
      organization: { organizationName: read.text(branding.organizationName), copyright: read.text(branding.copyright) },
    }
  })

  const backfill = read.total(structured => ({ projects: read.count(structured.projects) }))

  return { settings, configuration, organization, backfill }
}

export const settingsPresentHelper = createSettingsPresentHelper()
