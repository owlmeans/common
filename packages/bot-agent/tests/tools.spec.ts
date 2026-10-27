import { describe, expect, test } from 'bun:test'
import { toolHelper } from '@owlmeans/agent'
import { BotActionKind, BotTransport } from '@owlmeans/bot'
import { telegramBotPlatform } from '@owlmeans/server-bot'
import { BOT_AGENT_DONE, BotAgentTool, botAgentTools } from '../src/index.js'
import { makeTestBot, receive } from './context.js'

const callOf = (name: string, args: Record<string, unknown> = {}) =>
  ({ name, args, id: `call_${name}`, type: 'tool_call' as const })

describe('@owlmeans/bot-agent — botAgentTools', () => {
  test('each tool performs its action on the update, records the ref, and answers done', async () => {
    const bot = makeTestBot()
    const { connection, update, actions } = await receive(bot, { text: 'casino tonight', sender: { id: '777' } })
    // The id of the application's own keyword group the handler matched.
    const ref = 'group-spam'
    const tools = botAgentTools({ update, bot: actions, ref })

    for (const [name, args] of [
      [BotAgentTool.Reply, { text: 'Hello' }], [BotAgentTool.Delete, {}], [BotAgentTool.Warn, { text: 'No ads, please.' }],
      [BotAgentTool.Mute, { minutes: 60 }], [BotAgentTool.Ban, {}], [BotAgentTool.React, { emoji: '👎' }],
    ] as const) {
      expect(await toolHelper.safeInvokeTool(tools, callOf(name, args))).toBe(BOT_AGENT_DONE)
    }

    const message = { chat: update.chat.id, message: update.message!.ref.id }
    const member = { chat: update.chat.id, user: '777' }
    const activity = (await bot.service.activity.list(bot.scope)).reverse()
    expect(activity.map(entry => [entry.action, entry.ok, entry.update, entry.ref, entry.target, entry.text ?? null]))
      .toEqual([
        [BotActionKind.Reply, true, update.id, ref, message, 'Hello'],
        [BotActionKind.Delete, true, update.id, ref, message, null],
        [BotActionKind.Reply, true, update.id, ref, message, 'No ads, please.'],
        [BotActionKind.Mute, true, update.id, ref, member, null],
        [BotActionKind.Ban, true, update.id, ref, member, null],
        [BotActionKind.React, true, update.id, ref, message, '👎'],
      ])
    expect(activity.every(entry => entry.transport === BotTransport.Mock)).toBe(true)
    expect(telegramBotPlatform.mock.calls(connection).map(call => call.method)).toEqual(expect.arrayContaining([
      'sendMessage', 'deleteMessage', 'restrictChatMember', 'banChatMember', 'setMessageReaction',
    ]))
  })

  test('a refused action answers what went wrong instead of throwing', async () => {
    const bot = makeTestBot()
    const { connection, update, actions } = await receive(bot, { text: 'hello' })
    const tools = botAgentTools({ update, bot: actions })

    expect(await toolHelper.safeInvokeTool(tools, callOf(BotAgentTool.Reply, { text: ' ' })))
      .toEqual({ error: 'The text is empty.' })
    expect(await toolHelper.safeInvokeTool(tools, callOf(BotAgentTool.Mute, { minutes: 0 })))
      .toEqual({ error: 'A mute lasts at least one minute.' })
    // A wrong argument type never reaches the action: the schema refuses it, readable.
    expect(toolHelper.isToolError(await toolHelper.safeInvokeTool(tools, callOf(BotAgentTool.Mute, { minutes: 'soon' }))))
      .toBe(true)

    // The connection switched off between the update and the agent's decision.
    await bot.service.connections.save(bot.scope, { id: connection, platform: update.platform, label: 'Guard', enabled: false })
    const disabled = botAgentTools({ update, bot: await bot.service.actions(update) })
    const answer = await disabled[BotAgentTool.Delete].invoke({})
    expect(answer).toEqual({ error: 'The bot connection is switched off.' })
  })

  test('offers no message tool without a message and no member tool without a sender', async () => {
    const bot = makeTestBot()
    const { update, actions } = await receive(bot, { text: 'hello' })
    const names = (patch: object): string[] =>
      Object.values(botAgentTools({ update: { ...update, ...patch }, bot: actions })).map(item => item.name)

    expect(names({ message: undefined })).toEqual([BotAgentTool.Mute, BotAgentTool.Ban])
    expect(names({ sender: undefined }))
      .toEqual([BotAgentTool.Reply, BotAgentTool.Delete, BotAgentTool.Warn, BotAgentTool.React])
  })
})
