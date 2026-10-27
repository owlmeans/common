import { describe, expect, test } from 'bun:test'
import { BotChatKind } from '@owlmeans/bot'
import { botAgentHelper } from '../src/index.js'
import { makeTestBot, receive } from './context.js'

describe('@owlmeans/bot-agent — botAgentHelper', () => {
  test('instructionOf joins the given instructions — trimmed, empties and repeats dropped', () => {
    expect(botAgentHelper.instructionOf([' Delete advertising. ', 'Delete advertising.', '  ', 'Answer in English.']))
      .toBe('Delete advertising.\n\nAnswer in English.')
    expect(botAgentHelper.instructionOf('  Be brief. ')).toBe('Be brief.')
    expect(botAgentHelper.instructionOf('  ')).toBe('')
    expect(botAgentHelper.instructionOf([])).toBe('')
    expect(botAgentHelper.instructionOf()).toBe('')
  })

  test('contextOf says what is absent rather than inventing it, and adds no empty instruction block', async () => {
    const bot = makeTestBot()
    const { update } = await receive(bot, { text: 'hi there', chat: { kind: BotChatKind.Private } })

    const blocks = botAgentHelper.contextOf({ ...update, sender: undefined, message: undefined }, '  ')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('Chat: private')
    expect(blocks[0]).not.toContain('Sender:')
    expect(blocks[0]).toContain('The update carries no message.')
    expect(blocks[0]).not.toContain('keyword')
    expect(botAgentHelper.contextOf(update, ['Greet back.', 'Be brief.'])[1]).toBe('# Instruction\n\nGreet back.\n\nBe brief.')
  })

  test('promptOf names the platform and the chat, and the tools\' answers', async () => {
    const bot = makeTestBot()
    const { update } = await receive(bot, { text: 'hello', chat: { title: 'Gamers' } })

    expect(botAgentHelper.promptOf(update)).toStartWith('A message arrived in the Telegram chat "Gamers". ')
    expect(botAgentHelper.promptOf(update)).toContain('"done"')
  })
})
