import { describe, expect, test } from 'bun:test'
import { AuthenticationStage } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'
import {
  createBasicConnection, MessageType, SocketMessageMalformed, SocketUnauthorized, SocketUnsupported
} from '../src/index.js'
import type { Message } from '../src/index.js'

describe('@owlmeans/socket — inbound frame boundary', () => {
  test('rejects malformed JSON, non-object frames, and wire System frames', async () => {
    const connection = createBasicConnection()

    await expect(connection.receive('{')).rejects.toBeInstanceOf(SocketMessageMalformed)
    await expect(connection.receive('[]')).rejects.toBeInstanceOf(SocketMessageMalformed)
    await expect(connection.receive(JSON.stringify({
      type: MessageType.System, event: 'close', payload: {}
    }))).rejects.toBeInstanceOf(SocketMessageMalformed)
  })

  test('permits only authentication frames before a server carrier authenticates the connection', async () => {
    const connection = createBasicConnection()
    connection.requiresAuthentication = true

    await expect(connection.receive(JSON.stringify({
      type: MessageType.Message, payload: 'before-auth'
    }))).rejects.toBeInstanceOf(SocketUnauthorized)

    connection.stage = AuthenticationStage.Authenticated
    await connection.receive(JSON.stringify({ type: MessageType.Message, payload: 'after-auth' }))
    expect(connection.consume()).toEqual(['after-auth', undefined, 0])
  })

  test('answers an unknown call with a typed error instead of rejecting dispatch', async () => {
    const connection = createBasicConnection()
    const sent: Message<unknown>[] = []
    connection.send = async message => {
      if (typeof message !== 'string') sent.push(message)
    }

    await connection.receive(JSON.stringify({
      type: MessageType.Call, id: 'call-1', method: 'missing', payload: []
    }))

    expect(sent).toHaveLength(1)
    expect(sent[0]?.type).toBe(MessageType.Error)
    expect(ResilientError.ensure(sent[0]?.payload as string)).toBeInstanceOf(SocketUnsupported)
  })

  test('isolates rejecting listeners and still runs their peers', async () => {
    const connection = createBasicConnection()
    let observed = false
    connection.listen(async () => { throw new Error('listener failed') })
    connection.listen(async () => { observed = true })

    await connection.receive(JSON.stringify({ type: MessageType.Message, payload: 'event' }))

    expect(observed).toBe(true)
  })
})
