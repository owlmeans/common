import { ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'

import { catalogueHelper } from './catalogue.js'
import { makeToolProfileModel } from './profile.js'
import type { ToolHost, PlatformCapability, PlatformCatalogue } from './types.js'

/**
 * The catalogue as text, narrowed to what THIS session can drive.
 *
 * Two rules, and the second is the point. Nothing is listed that the host does not offer, so a
 * parent never proposes a path it cannot take. And every group that IS hidden says so in one line,
 * because a parent reading a shorter list without an explanation concludes the platform cannot do
 * the thing at all — and then writes the application by hand.
 *
 * Deterministic: no clock, no host name, no ordering that depends on a map. Two calls with the
 * same host produce the same bytes, which is what makes it safe to cache in a system prompt.
 */
export const renderPlatform = (catalogue: PlatformCatalogue, host: ToolHost): string => {
  const offered = new Set(catalogueHelper.visibleTools(host).map(tool => tool.name))
  const has = (tool: string): boolean => offered.has(tool)
  // What a catalogue name stands for under the host's profile — itself where there is none — so a
  // hidden tool is never named and a split tool is named by its variants.
  const names = makeToolProfileModel(host.profile).namesOf
  const offeredOf = (tools: readonly string[]): string[] => tools.flatMap(names).filter(has)

  const lines: string[] = [
    'THE OWLMEANS VIABLE PLATFORM',
    '',
    'It builds full-stack web applications from a description, and converts applications that'
    + ' already exist onto the same rails. Everything below is what the platform does; the'
    + ' "in this session" notes say which of it you can drive from here.',
    '',
    `This session: target=${host.target} (${
      host.target === ConnectTarget.Local
        ? 'the sources live on this machine'
        : 'the sources live in a platform slot'
    }), llm=${host.llm} (${
      // Read off the offered set, never off the mode alone. A host that cannot hold a session
      // cannot collect a task whatever the account setting says — and the setting is `local` there
      // often enough (an entitled account gets it on the URL host too) that branching on the mode
      // told such a parent to poll a `next_task` it was never offered, which it reports as a
      // broken server. Where the loop IS offered, every model call is the parent's.
      has('next_task')
        ? 'every model call the platform makes for this session is yours to perform — project'
          + ' drafting, content checks and formatting included'
        : host.llm === ConnectLlm.Local
          ? 'the platform performs its own model calls — this session cannot collect one'
          : 'the platform performs every model call itself, a conversion\'s included'
    }).`,
    '',
    'WHAT IT RUNS',
  ]

  for (const pipeline of catalogue.pipelines) {
    const startable = offeredOf(pipeline.startedBy)
    const starters = pipeline.startedBy.flatMap(names)
    lines.push(
      '',
      `  ${pipeline.title} · ${pipeline.id}`,
      `    ${pipeline.what}`,
      startable.length > 0
        ? `    start: ${startable.join(' or ')}`
        : starters.length > 0 || host.profile == null
          ? `    not startable in this session (${starters.join(', ')} is not offered here)`
          // Every tool that starts it is hidden by the profile — and a hidden tool is never named.
          : '    not startable in this session',
    )
    if (pipeline.stages != null) lines.push(`    steps: ${pipeline.stages.join(' → ')}`)
    lines.push(
      `    ${pipeline.resumable ? 'resumable — resume_pipeline continues it' : 'not resumable'}`,
    )
    if (pipeline.waitsFor != null && pipeline.waitsFor.length > 0) {
      lines.push(`    may wait for: ${pipeline.waitsFor.join(', ')}`)
    }
  }

  // Rendered whole on every host: what the platform GENERATES does not depend on which connector
  // is reading. Only the tool names are narrowed, like everywhere else.
  lines.push('', 'WHAT A GENERATED APPLICATION CARRIES')
  for (const feature of catalogue.features) {
    lines.push('', `  ${feature.title}`, `    ${feature.what}`)
    const tools = offeredOf(feature.tools ?? [])
    if (tools.length > 0) lines.push(`    see: ${tools.join(', ')}`)
  }

  lines.push('', 'WHAT YOU CAN CALL')
  const hidden: PlatformCapability[] = []
  for (const capability of catalogue.capabilities) {
    const available = offeredOf(capability.tools)
    if (available.length < 1) {
      hidden.push(capability)

      continue
    }
    lines.push(
      '',
      `  ${capability.title}`,
      `    ${capability.what}`,
      `    ${available.join(', ')}`,
    )
  }

  if (hidden.length > 0) {
    lines.push('', 'NOT IN THIS SESSION (the platform does it; this connector cannot)')
    for (const capability of hidden) {
      lines.push(`  ${capability.title} — ${capability.absent}`)
    }
  }

  lines.push(
    '',
    'LIMITS',
    `  every tool answers within ${Math.round(catalogue.limits.toolDeadlineMs / 1000)}s — long work`
    + ' continues server-side and is read through its domain status tool',
    // Named only where the tool is offered: a limit for a call that is not in the list is an
    // invitation to make it.
    ...(has('next_task')
      ? [`  next_task waits up to ${Math.round(catalogue.limits.nextTaskWaitMs / 1000)}s`]
      : []),
    ...(has('next_question')
      ? [`  next_question waits up to ${Math.round(catalogue.limits.nextQuestionWaitMs / 1000)}s`]
      : []),
    '',
    'Publishing to production, custom domains and billing are done by the user in the web'
    + ' application, and are deliberately not offered through a connector.',
  )

  return lines.join('\n')
}
