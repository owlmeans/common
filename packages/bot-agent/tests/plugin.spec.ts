import { describe, expect, test } from 'bun:test'
import { makeAgentModel, type AgentRun } from '@owlmeans/agent'
import { BotActionKind } from '@owlmeans/bot'
import { DEFAULT_EFFORT, makeExecutionService, makePromptService } from '@owlmeans/llm'
import { BOT_AGENT_PLUGIN, BotAgentTool, botAgentPlugin } from '../src/index.js'
import { makeTestBot, matchedGroups, receive, whatsAppUpdate, type KeywordGroup } from './context.js'
import { scriptedModel } from './_tools/model.js'

/** The application's own keyword groups — the handler matches them, the plugin only hears their instructions. */
const GROUPS: KeywordGroup[] = [
  { id: 'g-spam', keywords: ['casino', 'free money'], instruction: 'Delete advertising.' },
  { id: 'g-rude', keywords: ['idiot'], instruction: 'Warn politely.' },
  { id: 'g-weather', keywords: ['rain'], instruction: 'Mention the umbrella.' },
]

/** The plugin ignores the run it is handed; a spec has none outside a loop. */
const NO_RUN = {} as AgentRun

describe('@owlmeans/bot-agent — botAgentPlugin', () => {
  test('contributes the message, chat, sender, replied-to text and the instructions the handler passes', async () => {
    const bot = makeTestBot()
    const { update, actions } = await receive(bot, {
      text: 'Free money at the CASINO, idiot!\nJoin now',
      chat: { title: 'Gamers' },
      sender: { id: '777', name: 'Spammer', username: 'spammer' },
      replyTo: { id: '5', text: 'Welcome, everyone' },
    })

    const matched = matchedGroups(update.message?.text ?? '', GROUPS)
    const plugin = botAgentPlugin({
      update, bot: actions, ref: matched[0].id,
      instruction: [...matched.map(group => group.instruction ?? ''), 'Never ban anybody.'],
    })
    const [message, instruction, ...rest] = await plugin.context!(NO_RUN)

    expect(rest).toEqual([])
    expect(message).toContain('Platform: Telegram')
    expect(message).toContain('Chat: group "Gamers"')
    expect(message).toContain('Sender: Spammer (@spammer)')
    expect(message).toContain('> Free money at the CASINO, idiot!\n> Join now')
    expect(message).toContain('> Welcome, everyone')
    expect(instruction).toBe('# Instruction\n\nDelete advertising.\n\nWarn politely.\n\nNever ban anybody.')
    expect(instruction).not.toContain('umbrella')
    // No instruction: the message alone.
    expect(await botAgentPlugin({ update, bot: actions }).context!(NO_RUN)).toEqual([message])
  })

  test('offers only the tools the platform supports and allow names', async () => {
    const bot = makeTestBot()
    const telegram = await receive(bot, { text: 'casino' })
    const whatsApp = await whatsAppUpdate(bot)
    const names = (options: Parameters<typeof botAgentPlugin>[0]): string[] =>
      Object.values(botAgentPlugin(options).tools!(NO_RUN)).map(item => item.name)

    expect(names({ update: telegram.update, bot: telegram.actions })).toEqual([
      BotAgentTool.Reply, BotAgentTool.Delete, BotAgentTool.Warn, BotAgentTool.Mute, BotAgentTool.Ban, BotAgentTool.React,
    ])
    expect(names({ update: telegram.update, bot: telegram.actions, allow: [BotActionKind.Delete, BotActionKind.Mute] }))
      .toEqual([BotAgentTool.Delete, BotAgentTool.Mute])
    // WhatsApp can reply and react — never delete, mute or ban — and `warn` is a reply.
    expect(names({ update: whatsApp.update, bot: whatsApp.actions })).toEqual([
      BotAgentTool.Reply, BotAgentTool.Warn, BotAgentTool.React,
    ])
    expect(names({ update: whatsApp.update, bot: whatsApp.actions, allow: [BotActionKind.Delete, BotActionKind.Ban] }))
      .toEqual([])
  })

  test('keeps one alias: registering it for the next update replaces the previous one', async () => {
    const bot = makeTestBot()
    const first = await receive(bot, { text: 'the first message' })
    const second = await receive(bot, { text: 'the second message' })
    const scripted = scriptedModel([{ content: 'nothing to do' }])
    const agent = makeAgentModel({
      exec: makeExecutionService('bot-agent-alias-exec').root({
        models: () => { throw new Error('the agent asks agentModel only') },
        prompts: () => makePromptService({}, 'bot-agent-alias-prompts'),
        policy: { effort: DEFAULT_EFFORT },
        purpose: { type: 'bot-agent-spec' },
        prompt: { role: 'You moderate a chat.' },
      }),
      agentModel: scripted.model,
      tools: {},
    })

    agent.use(botAgentPlugin({ update: first.update, bot: first.actions }))
    agent.use(botAgentPlugin({ update: second.update, bot: second.actions }))
    await agent.invoke('act')

    expect(botAgentPlugin({ update: first.update, bot: first.actions }).alias).toBe(BOT_AGENT_PLUGIN)
    const asked = JSON.stringify(scripted.asked()[0])
    expect(asked).toContain('the second message')
    expect(asked).not.toContain('the first message')
    expect(asked.split('# The chat message').length - 1).toBe(1)
  })
})
