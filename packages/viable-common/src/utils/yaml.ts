import {
  FRONTMATTER_BLOCK, YAML_ESCAPES, YAML_FALSES, YAML_FLOAT, YAML_HEX, YAML_INT, YAML_NULLS, YAML_OCTAL, YAML_TRUES,
  YAML_UNSUPPORTED_STARTS,
} from './yaml/consts.js'
import type { YamlLine, YamlUtils } from './yaml/types.js'

export const createYamlUtils = (): YamlUtils => {
  const fail = (message: string): never => {
    throw new SyntaxError(`yaml: ${message}`)
  }

  const toLines = (text: string): YamlLine[] => text.split(/\r?\n/).map(raw => {
    const lead = /^[ \t]*/.exec(raw)?.[0] ?? ''
    const content = raw.slice(lead.length).replace(/\s+$/, '')
    const empty = content === '' || content.startsWith('#')
    if (!empty && lead.includes('\t')) fail('tab in indentation')

    return { indent: lead.length, content, empty }
  })

  const isSeqItem = (content: string): boolean => content === '-' || content.startsWith('- ')

  /** Index of the quote closing the scalar that opens `source`, or -1. */
  const closingQuote = (source: string, quote: string): number => {
    for (let i = 1; i < source.length; i++) {
      const ch = source[i]
      if (quote === '"' && ch === '\\') {
        i++
        continue
      }
      if (ch === quote) {
        if (quote === '\'' && source[i + 1] === '\'') {
          i++
          continue
        }

        return i
      }
    }

    return -1
  }

  /** A quoted scalar's body, line breaks folded and escapes applied. */
  const unquote = (body: string, quote: string): string => {
    const double = quote === '"'
    const rows = body.split('\n').map((row, i, all) => {
      const lead = i > 0 ? row.replace(/^[ \t]+/, '') : row

      return i < all.length - 1 ? lead.replace(/[ \t]+$/, '') : lead
    })
    let out = rows[0]
    let empties = 0
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (row === '' && i < rows.length - 1) {
        empties++
        continue
      }
      if (empties > 0) out += '\n'.repeat(empties)
      else if (double && /(?:^|[^\\])(?:\\\\)*\\$/.test(out)) out = out.slice(0, -1)
      else out += ' '
      out += row
      empties = 0
    }

    if (!double) return out.replace(/''/g, '\'')

    return out.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[\s\S])/g, (_match, esc: string) => {
      if (esc.length > 1) return String.fromCodePoint(parseInt(esc.slice(1), 16))
      const mapped = YAML_ESCAPES[esc]

      return mapped ?? fail(`unknown escape \\${esc}`)
    })
  }

  const resolvePlain = (text: string): unknown => {
    if (text === '' || YAML_NULLS.includes(text)) return null
    if (YAML_TRUES.includes(text)) return true
    if (YAML_FALSES.includes(text)) return false
    if (YAML_INT.test(text) || YAML_FLOAT.test(text)) return Number(text)
    if (YAML_OCTAL.test(text)) return parseInt(text.slice(2), 8)
    if (YAML_HEX.test(text)) return parseInt(text.slice(2), 16)
    if (/^[-+]?\.(?:inf|Inf|INF)$/.test(text)) return text.startsWith('-') ? -Infinity : Infinity
    if (/^\.(?:nan|NaN|NAN)$/.test(text)) return NaN
    if (YAML_UNSUPPORTED_STARTS.includes(text[0])) fail(`unsupported indicator "${text[0]}"`)

    return text
  }

  const stripComment = (text: string): string => {
    const at = text.search(/\s#/)

    return (at < 0 ? text : text.slice(0, at)).trimEnd()
  }

  /** A key and what follows its colon, or `null` when the content is not a mapping entry. */
  const splitKey = (content: string): { key: string, rest: string } | null => {
    if (content.startsWith('"') || content.startsWith('\'')) {
      const end = closingQuote(content, content[0])
      if (end < 0) return null
      const after = content.slice(end + 1)
      const colon = /^\s*:(?:\s+|$)/.exec(after)
      if (colon == null) return null

      return { key: unquote(content.slice(1, end), content[0]), rest: after.slice(colon[0].length) }
    }
    if (isSeqItem(content) || content.startsWith('[') || content.startsWith('{') || content.startsWith('#')) return null
    const colon = /:(?:\s|$)/.exec(content)
    if (colon == null) return null
    const key = content.slice(0, colon.index).trim()
    if (key === '') return null
    if (YAML_UNSUPPORTED_STARTS.includes(key[0])) fail(`unsupported key "${key}"`)

    return { key, rest: content.slice(colon.index + 1).trim() }
  }

  const assign = (target: Record<string, unknown>, key: string, value: unknown): void => {
    if (key === '__proto__') fail('refused key __proto__')
    if (Object.prototype.hasOwnProperty.call(target, key)) fail(`duplicate key "${key}"`)
    target[key] = value
  }

  const parse = (text: string): unknown => {
    const lines = toLines(text)
    let pos = 0

    const skip = (): YamlLine | null => {
      while (pos < lines.length && lines[pos].empty) pos++

      return pos < lines.length ? lines[pos] : null
    }

    /** The block node on the following lines, indented deeper than `parent`; `null` when there is none. */
    const parseNode = (parent: number): unknown => {
      const line = skip()
      if (line == null || line.indent <= parent) return null
      if (isSeqItem(line.content)) return parseSequence(line.indent)
      if (splitKey(line.content) != null) return parseMapping(line.indent)
      pos++

      return inlineValue(line.content, parent)
    }

    const parseMapping = (indent: number): Record<string, unknown> => {
      const result: Record<string, unknown> = {}
      for (let line = skip(); line != null && line.indent >= indent; line = skip()) {
        if (line.indent > indent) fail(`unexpected indentation at "${line.content}"`)
        const entry = splitKey(line.content) ?? fail(`not a mapping entry: "${line.content}"`)
        pos++
        assign(result, entry.key, valueAfterKey(entry.rest, indent))
      }

      return result
    }

    const valueAfterKey = (rest: string, indent: number): unknown => {
      if (rest !== '' && !rest.startsWith('#')) return inlineValue(rest, indent)
      const next = skip()
      if (next == null) return null
      if (next.indent > indent) return parseNode(indent)
      // A sequence may sit at its key's own indentation.
      if (next.indent === indent && isSeqItem(next.content)) return parseSequence(indent)

      return null
    }

    const parseSequence = (indent: number): unknown[] => {
      const items: unknown[] = []
      for (let line = skip(); line != null && line.indent >= indent; line = skip()) {
        if (line.indent > indent) fail(`unexpected indentation at "${line.content}"`)
        if (!isSeqItem(line.content)) break
        const rest = line.content === '-' ? '' : line.content.slice(2).replace(/^\s+/, '')
        if (rest === '' || rest.startsWith('#')) {
          pos++
          items.push(parseNode(indent))
          continue
        }
        if (isSeqItem(rest) || splitKey(rest) != null) {
          // The item's first line, re-read at its own column, so its siblings line up beneath it.
          const column = line.indent + (line.content.length - rest.length)
          lines[pos] = { indent: column, content: rest, empty: false }
          items.push(isSeqItem(rest) ? parseSequence(column) : parseMapping(column))
          continue
        }
        pos++
        items.push(inlineValue(rest, indent))
      }

      return items
    }

    /** A value that starts on the current line (already consumed) and may continue below `parent`. */
    const inlineValue = (text: string, parent: number): unknown => {
      const first = text[0]
      if (first === '[' || first === '{') return flowValue(text)
      if (first === '"' || first === '\'') return quotedValue(text)
      if (first === '|' || first === '>') return blockScalar(text, parent)

      return plainValue(text, parent)
    }

    /** A piece of a plain scalar — never a `key: value` in disguise, which YAML refuses as well. */
    const plainPiece = (text: string): string => {
      const piece = stripComment(text)
      if (/:(?:\s|$)/.test(piece)) fail(`a mapping value inside a plain scalar: "${piece}"`)

      return piece
    }

    const plainValue = (text: string, parent: number): unknown => {
      let value = plainPiece(text)
      let breaks = 0
      while (pos < lines.length) {
        const line = lines[pos]
        if (line.content === '') {
          breaks++
          pos++
          continue
        }
        if (line.empty || line.indent <= parent) break
        value += breaks > 0 ? '\n'.repeat(breaks) : ' '
        value += plainPiece(line.content)
        breaks = 0
        pos++
      }

      return resolvePlain(value.trim())
    }

    const quotedValue = (text: string): string => {
      const quote = text[0]
      let source = text
      for (;;) {
        const end = closingQuote(source, quote)
        if (end >= 0) {
          const rest = source.slice(end + 1).trim()
          if (rest !== '' && !rest.startsWith('#')) fail(`text after a quoted scalar: "${rest}"`)

          return unquote(source.slice(1, end), quote)
        }
        if (pos >= lines.length) fail('unterminated quoted scalar')
        source += '\n' + lines[pos++].content
      }
    }

    const blockScalar = (header: string, parent: number): string => {
      const head = /^([|>])([-+]?)([1-9]?)([-+]?)(?:\s+#.*)?$/.exec(header) ?? fail(`bad block scalar header "${header}"`)
      const literal = head[1] === '|'
      const chomp = head[2] !== '' ? head[2] : head[4]
      let indent = head[3] !== '' ? Math.max(parent, 0) + Number(head[3]) : -1
      const rows: string[] = []
      while (pos < lines.length) {
        const line = lines[pos]
        if (line.content === '') {
          rows.push('')
          pos++
          continue
        }
        if (indent < 0) {
          if (line.indent <= parent) break
          indent = line.indent
        }
        if (line.indent < indent) break
        rows.push(' '.repeat(line.indent - indent) + line.content)
        pos++
      }

      let out: string | null = null
      let blanks = 0
      let previousMore = false
      for (const row of rows) {
        if (row === '') {
          blanks++
          continue
        }
        const more = row.startsWith(' ')
        if (out == null) out = '\n'.repeat(blanks) + row
        else if (literal) out += '\n'.repeat(blanks + 1) + row
        else if (blanks > 0) out += '\n'.repeat(more || previousMore ? blanks + 1 : blanks) + row
        else out += (more || previousMore ? '\n' : ' ') + row
        blanks = 0
        previousMore = more
      }
      if (out == null) return ''
      if (chomp === '-') return out
      if (chomp === '+') return out + '\n' + '\n'.repeat(blanks)

      return out + '\n'
    }

    const flowValue = (text: string): unknown => {
      let source = text
      while (!flowClosed(source)) {
        if (pos >= lines.length) fail('unterminated flow collection')
        source += ' ' + lines[pos++].content
      }
      let at = 0
      const ws = (): void => {
        while (at < source.length && /\s/.test(source[at])) at++
      }
      const readQuoted = (): string => {
        const quote = source[at]
        const end = closingQuote(source.slice(at), quote)
        if (end < 0) fail('unterminated quoted scalar in a flow collection')
        const body = source.slice(at + 1, at + end)
        at += end + 1

        return unquote(body, quote)
      }
      const readPlainText = (): string => {
        const start = at
        for (; at < source.length; at++) {
          const ch = source[at]
          if (',[]{}'.includes(ch)) break
          if (ch === ':' && (at + 1 >= source.length || /[\s,\]}]/.test(source[at + 1]))) break
        }

        return source.slice(start, at).trim()
      }
      const readItem = (): unknown => {
        ws()
        const ch = source[at]
        if (ch === '[') return readSeq()
        if (ch === '{') return readMap()
        if (ch === '"' || ch === '\'') return readQuoted()

        return resolvePlain(readPlainText())
      }
      const readSeq = (): unknown[] => {
        at++
        const out: unknown[] = []
        for (;;) {
          ws()
          if (source[at] === ']') {
            at++

            return out
          }
          if (at >= source.length) fail('unterminated [')
          out.push(readItem())
          ws()
          if (source[at] === ',') {
            at++
            continue
          }
          if (source[at] !== ']') fail('expected "," or "]"')
        }
      }
      const readMap = (): Record<string, unknown> => {
        at++
        const out: Record<string, unknown> = {}
        for (;;) {
          ws()
          if (source[at] === '}') {
            at++

            return out
          }
          if (at >= source.length) fail('unterminated {')
          const key = source[at] === '"' || source[at] === '\'' ? readQuoted() : readPlainText()
          ws()
          let value: unknown = null
          if (source[at] === ':') {
            at++
            ws()
            value = source[at] === ',' || source[at] === '}' ? null : readItem()
          }
          assign(out, key, value)
          ws()
          if (source[at] === ',') {
            at++
            continue
          }
          if (source[at] !== '}') fail('expected "," or "}"')
        }
      }

      const value = readItem()
      ws()
      const rest = source.slice(at)
      if (rest !== '' && !rest.startsWith('#')) fail(`text after a flow collection: "${rest}"`)

      return value
    }

    /** Whether the flow collection opening `source` closes in it — quotes honoured where a token starts. */
    const flowClosed = (source: string): boolean => {
      let depth = 0
      let previous = ''
      for (let i = 0; i < source.length; i++) {
        const ch = source[i]
        if ((ch === '"' || ch === '\'') && '[{,:'.includes(previous)) {
          const end = closingQuote(source.slice(i), ch)
          if (end < 0) return false
          i += end
          previous = ch
          continue
        }
        if (ch === '[' || ch === '{') depth++
        else if (ch === ']' || ch === '}') {
          depth--
          if (depth === 0) return true
        }
        if (!/\s/.test(ch)) previous = ch
      }

      return false
    }

    const first = skip()
    if (first == null) return null
    const value = parseNode(-1)
    const extra = skip()
    if (extra != null) fail(`content after the document: "${extra.content}"`)

    return value
  }

  const frontmatterOf = (source: string): unknown => {
    const match = FRONTMATTER_BLOCK.exec(source.replace(/^﻿/, '').replace(/^\s+/, ''))
    if (match == null) return null
    try {
      return parse(match[1])
    } catch {
      return null
    }
  }

  return { parse, frontmatterOf }
}

export const yamlUtils = createYamlUtils()
