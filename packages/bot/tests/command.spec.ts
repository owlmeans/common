import { describe, expect, test } from 'bun:test'
import { botCommandHelper } from '../src/index.js'

describe('botCommandHelper.parse', () => {
  test('reads a command addressed to this bot, its name lower-cased and its args trimmed', () => {
    expect(botCommandHelper.parse('/report@MyBot some args', 'MyBot')).toEqual({ name: 'report', args: 'some args' })
    expect(botCommandHelper.parse('  /Report@mybot   spam  here  ', '@MYBOT')).toEqual({ name: 'report', args: 'spam  here' })
    expect(botCommandHelper.parse('/start')).toEqual({ name: 'start', args: '' })
    expect(botCommandHelper.parse('/report\nline one\nline two', 'MyBot')).toEqual({ name: 'report', args: 'line one\nline two' })
  })

  test('ignores a command addressed to another bot, and accepts any address when its own name is unknown', () => {
    expect(botCommandHelper.parse('/report@OtherBot spam', 'MyBot')).toBeNull()
    expect(botCommandHelper.parse('/report@OtherBot spam')).toEqual({ name: 'report', args: 'spam' })
  })

  test('answers null for text that is not a command', () => {
    expect(botCommandHelper.parse('hello /report')).toBeNull()
    expect(botCommandHelper.parse('/usr/bin is a path')).toBeNull()
    expect(botCommandHelper.parse('/')).toBeNull()
    expect(botCommandHelper.parse('/report@')).toBeNull()
  })
})
