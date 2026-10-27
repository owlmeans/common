import { describe, expect, test } from 'bun:test'
import { BotChatKind, BotRuleAction } from '@owlmeans/bot'
import { botAgentHelper } from '../src/index.js'
import { makeTestBot, receive } from './context.js'

describe('@owlmeans/bot-agent — botAgentHelper', () => {
  test('instructionOf joins the matched groups\' instructions, then the extra one', async () => {
    const bot = makeTestBot()
    const { update } = await receive(bot, { text: 'casino idiot rain' }, [
      { name: 'Spam', keywords: ['casino'], action: BotRuleAction.Agent, instruction: ' Delete advertising. ', order: 1 },
      { name: 'Rude', keywords: ['idiot'], action: BotRuleAction.Agent, instruction: 'Delete advertising.', order: 2 },
      { name: 'Weather', keywords: ['rain'], action: BotRuleAction.Reply, reply: 'Umbrella.', order: 3 },
    ])

    expect(botAgentHelper.instructionOf(update, 'Answer in English.')).toBe('Delete advertising.\n\nAnswer in English.')
    expect(botAgentHelper.instructionOf({ ...update, matches: [] })).toBe('')
  })

  test('contextOf says what is absent rather than inventing it', async () => {
    const bot = makeTestBot()
    const { update } = await receive(bot, { text: 'hi there', chat: { kind: BotChatKind.Private } })

    const blocks = botAgentHelper.contextOf({ ...update, sender: undefined, message: undefined }, '  ')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain('Chat: private')
    expect(blocks[0]).not.toContain('Sender:')
    expect(blocks[0]).toContain('The update carries no message.')
    expect(blocks[1]).toContain('None — the message matched no keyword group')
  })

  test('promptOf names the platform and the chat, and the tools\' answers', async () => {
    const bot = makeTestBot()
    const { update } = await receive(bot, { text: 'hello', chat: { title: 'Gamers' } })

    expect(botAgentHelper.promptOf(update)).toStartWith('A message arrived in the Telegram chat "Gamers". ')
    expect(botAgentHelper.promptOf(update)).toContain('"done"')
  })
})
