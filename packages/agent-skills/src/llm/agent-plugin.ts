import { tool } from '@langchain/core/tools'
import { resolveFileProvider } from '@owlmeans/llm-common'
import type { FileProviderRef } from '@owlmeans/llm-common'
import type { AgentPlugin, AgentToolSet } from '@owlmeans/agent'
import { loadProjectSkills } from './project.js'

export const PROJECT_SKILLS_AGENT_PLUGIN = 'project-skills'

const DEFAULT_MAX_BODY_CHARS = 24000

export interface ProjectSkillsAgentOptions {
  /** Host file access for the project the run works on. Without it the tool is not offered. */
  files?: FileProviderRef
  /** Directory the skills live in. Defaults to `.agents/skills`. */
  dir?: string
  /** Skill names the agent may not read. */
  exclude?: string[]
  /** Length one returned body is clipped to. Defaults to 24000. */
  maxBodyChars?: number
  /** How long a directory listing is trusted. Defaults to 30000ms. */
  listTtlMs?: number
}

/**
 * The read half of progressive disclosure, as a tool.
 *
 * `projectSkillsPlugin` puts the index in the system prompt so the model knows which
 * skills exist; this lets it pull one body mid-run, at the moment it turns out to need it.
 * A tool is the right shape for that and prompt composition is not: composition happens
 * once, before the first token, when nobody yet knows which of twelve turns will touch
 * the deployment guidance.
 *
 * The tool never throws — a rejected tool call aborts the whole LangGraph superstep and
 * takes every sibling call with it. A missing skill comes back as a sentence the model
 * can read and act on, which is also the honest answer: it asked for something that does
 * not exist, and the reply names what does.
 */
export const projectSkillsAgentPlugin = (
  options: ProjectSkillsAgentOptions = {},
): AgentPlugin => {
  const maxBodyChars = options.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS

  return {
    alias: PROJECT_SKILLS_AGENT_PLUGIN,
    order: 55,

    tools: (): AgentToolSet => {
      const provider = resolveFileProvider(options.files)
      if (provider == null) {
        return {}
      }

      return {
        read_skill: tool(
          async ({ name }: { name: string }) => {
            const skills = await loadProjectSkills(provider, options)
            const found = skills.find(skill => skill.name === name)
            if (found == null) {
              return skills.length === 0
                ? 'No skills are installed in this project.'
                : `No skill named "${name}". Installed: ${skills.map(s => s.name).join(', ')}.`
            }

            return found.body.length <= maxBodyChars
              ? found.body
              : `${found.body.slice(0, maxBodyChars).trimEnd()}...`
          },
          {
            name: 'read_skill',
            description:
              'Read the full text of one skill installed in this project, by the name it '
              + 'carries in the project-skills index. Read it before acting on what it covers.',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Skill name, as listed in the index.' },
              },
              required: ['name'],
              additionalProperties: false,
            },
          },
        ),
      }
    },
  }
}
