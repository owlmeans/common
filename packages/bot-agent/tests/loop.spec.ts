import { describe, expect, test } from 'bun:test'
import type { ToolMessage } from '@langchain/core/messages'
import { makeAgentModel, type AgentModel, type AgentResult } from '@owlmeans/agent'
import { BotActionKind } from '@owlmeans/bot'
import { DEFAULT_EFFORT, makeExecutionService, makePromptService } from '@owlmeans/llm'
import { BOT_AGENT_DONE, BotAgentTool, botAgentHelper, botAgentPlugin } from '../src/index.js'
import { makeTestBot, matchedGroups, receive, type KeywordGroup } from './context.js'
import { scriptedModel, type ScriptedModel, type ScriptedTurn } from './_tools/model.js'

const ROLE = 'You moderate a community chat for its owner. Judge each message against the matched '
  + 'keyword groups\' instructions and act only through your tools.'

/** The shape a target's agent module has: one execution, one prompt service, the model handed in. */
const executions = makeExecutionService('bot-agent-loop-exec')
const prompts = makePromptService({}, 'bot-agent-loop-prompts')
const exec = executions.root({
  models: () => { throw new Error('the agent asks agentModel only') },
  prompts: () => prompts,
  policy: { effort: DEFAULT_EFFORT },
  purpose: { type: 'moderator' },
  prompt: { role: ROLE },
})

const makeModeratorAgent = (scripted: ScriptedModel): AgentModel =>
  makeAgentModel({ exec, agentModel: scripted.model, tools: {}, maxTurns: 6 })

/** The application's own keyword groups, as its generated handler reads them. */
const GROUPS: KeywordGroup[] = [
  { id: 'group-spam', keywords: ['casino'], instruction: 'Delete advertising and warn the sender.' },
]

/** A message simulated on a mock Telegram connection; the handler runs the agent over it. */
const moderate = async (text: string, script: ScriptedTurn[]) => {
  const bot = makeTestBot()
  const scripted = scriptedModel(script)
  let result: AgentResult | null = null
  const received = await receive(bot, { text, sender: { id: '777', name: 'Spammer' } }, async (update, actions) => {
    // The generated handler: match the app's groups, hand their instructions and the first one's id over.
    const matched = matchedGroups(update.message?.text ?? '', GROUPS)
    if (matched.length === 0) {
      return
    }
    const agent = makeModeratorAgent(scripted)
    agent.use(botAgentPlugin({
      update, bot: actions, allow: [BotActionKind.Delete, BotActionKind.Reply, BotActionKind.Mute],
      ref: matched[0].id, instruction: matched.map(group => group.instruction ?? ''),
    }))
    result = await agent.invoke(botAgentHelper.promptOf(update), { action: 'moderate' })
  })
  if (result == null) {
    throw new Error('the agent did not run')
  }
  const tools = (result as AgentResult).messages.filter(message => message.getType() === 'tool') as ToolMessage[]

  return { bot, scripted, received, result: result as AgentResult, tools }
}

describe('@owlmeans/bot-agent — an agent loop over a bot update', () => {
  test('the agent reads the message from its context and acts through the tools', async () => {
    const { bot, scripted, received, result, tools } = await moderate('Best casino in town', [
      {
        toolCalls: [
          { name: BotAgentTool.Delete, args: {} },
          { name: BotAgentTool.Warn, args: { text: 'Advertising is not allowed here.' } },
        ],
      },
      { content: 'Deleted the casino ad and warned the sender.' },
    ])

    // Bound with exactly the allowed tools the platform supports, every round.
    expect(scripted.bound()).toEqual([
      [BotAgentTool.Reply, BotAgentTool.Delete, BotAgentTool.Warn, BotAgentTool.Mute],
      [BotAgentTool.Reply, BotAgentTool.Delete, BotAgentTool.Warn, BotAgentTool.Mute],
    ])
    // The persona in the system message; the message and its group in the project message after it.
    const [system, project] = scripted.asked()[0] as Array<{ getType: () => string, content: unknown }>
    expect(system.getType()).toBe('system')
    expect(JSON.stringify(system.content)).toContain('You moderate a community chat')
    expect(JSON.stringify(system.content)).not.toContain('Best casino in town')
    expect(project.getType()).toBe('human')
    expect(JSON.stringify(project.content)).toContain('> Best casino in town')
    expect(JSON.stringify(project.content)).toContain('# Instruction\\n\\nDelete advertising and warn the sender.')

    expect(tools.map(message => [message.name, message.content, message.status]))
      .toEqual([[BotAgentTool.Delete, BOT_AGENT_DONE, 'success'], [BotAgentTool.Warn, BOT_AGENT_DONE, 'success']])
    expect(result.message.content).toBe('Deleted the casino ad and warned the sender.')
    const activity = (await bot.service.activity.list(bot.scope)).reverse()
    expect(activity.map(entry => [entry.action, entry.ok, entry.update, entry.ref, entry.text ?? null])).toEqual([
      [BotActionKind.Delete, true, received.update.id, 'group-spam', null],
      [BotActionKind.Reply, true, received.update.id, 'group-spam', 'Advertising is not allowed here.'],
    ])
  })

  test('a refused or unoffered tool comes back to the model as an error and the run goes on', async () => {
    const { bot, tools, result } = await moderate('casino again', [
      { toolCalls: [{ name: BotAgentTool.Mute, args: { minutes: 0 } }, { name: BotAgentTool.Ban, args: {} }] },
      { content: 'Could not mute; banning is not mine to do.' },
    ])

    expect(tools.map(message => [message.name, message.status])).toEqual([
      [BotAgentTool.Mute, 'error'], [BotAgentTool.Ban, 'error'],
    ])
    expect(tools[0].content).toBe('A mute lasts at least one minute.')
    expect(tools[1].content).toContain('Tool ban not found')
    expect(result.message.content).toBe('Could not mute; banning is not mine to do.')
    expect((await bot.service.activity.list(bot.scope)).map(entry => [entry.action, entry.ok]))
      .toEqual([[BotActionKind.Mute, false]])
  })
})
