import { describe, expect, test } from 'bun:test'
import { makeAgentModel, type AgentRun } from '@owlmeans/agent'
import { BotActionKind, BotRuleAction } from '@owlmeans/bot'
import { DEFAULT_EFFORT, makeExecutionService, makePromptService } from '@owlmeans/llm'
import { BOT_AGENT_PLUGIN, BotAgentTool, botAgentPlugin } from '../src/index.js'
import { makeTestBot, receive, whatsAppUpdate } from './context.js'
import { scriptedModel } from './_tools/model.js'

const RULES = [
  { name: 'Spam', keywords: ['casino', 'free money'], action: BotRuleAction.Delete, instruction: 'Delete advertising.', order: 1 },
  { name: 'Rudeness', keywords: ['idiot'], action: BotRuleAction.Agent, instruction: 'Warn politely.', reply: 'Be kind.', order: 2 },
  { name: 'Weather', keywords: ['rain'], action: BotRuleAction.Reply, reply: 'Take an umbrella.', order: 3 },
]

/** The plugin ignores the run it is handed; a spec has none outside a loop. */
const NO_RUN = {} as AgentRun

describe('@owlmeans/bot-agent — botAgentPlugin', () => {
  test('contributes the message, chat, sender, replied-to text, every matched group and the instruction', async () => {
    const bot = makeTestBot()
    const { update, actions } = await receive(bot, {
      text: 'Free money at the CASINO, idiot!\nJoin now',
      chat: { title: 'Gamers' },
      sender: { id: '777', name: 'Spammer', username: 'spammer' },
      replyTo: { id: '5', text: 'Welcome, everyone' },
    }, RULES)

    const plugin = botAgentPlugin({ update, bot: actions, instruction: 'Never ban anybody.' })
    const [message, groups, instruction, ...rest] = await plugin.context!(NO_RUN)

    expect(rest).toEqual([])
    expect(message).toContain('Platform: Telegram')
    expect(message).toContain('Chat: group "Gamers"')
    expect(message).toContain('Sender: Spammer (@spammer)')
    expect(message).toContain('> Free money at the CASINO, idiot!\n> Join now')
    expect(message).toContain('> Welcome, everyone')
    expect(groups).toContain('## 1. Spam\nKeywords matched: casino, free money\nAction: delete\nInstruction: Delete advertising.')
    // `agent` is the hand-over itself, not an action to tell the model about.
    expect(groups).toContain('## 2. Rudeness\nKeywords matched: idiot\nReply text: Be kind.\nInstruction: Warn politely.')
    expect(groups).not.toContain('Weather')
    expect(instruction).toBe('# Instruction\n\nNever ban anybody.')
  })

  test('offers only the tools the platform supports and allow names', async () => {
    const bot = makeTestBot()
    const telegram = await receive(bot, { text: 'casino' }, RULES)
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
