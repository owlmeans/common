import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PICKER_COLORS, PICKER_COLOR_KEYS, PICKER_FALLBACK_COLOR, PICKER_FALLBACK_ICON, PICKER_ICON_CATEGORIES,
  PICKER_ICON_ENTRIES, PICKER_ICON_NAMES, pickerColorHelper,
} from '../src/picker/vocabulary.js'
import { PICKER_ICONS } from '../src/picker/icons/consts.js'
import { pickerIconHelper } from '../src/picker/icons.js'

// Colour arithmetic written here, independently of the package's own, so the palette is checked
// against the definitions rather than against itself.
const channels = (hex: string): number[] => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
const linear = (c: number): number => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const luminance = (hex: string): number => {
  const [r, g, b] = channels(hex).map(linear)

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)]

  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const oklab = (hex: string): number[] => {
  const [r, g, b] = channels(hex).map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const distance = (a: string, b: string): number => {
  const [x, y] = [oklab(a), oklab(b)]

  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

/** The ten hues the generated targets' look has always used — their values may never move. */
const LEGACY: Record<string, [string, string, string, string]> = {
  slate: ['#334155', '#F1F5F9', '#CBD5E1', '#1E293B'],
  blue: ['#1D4ED8', '#DBEAFE', '#93C5FD', '#172554'],
  sky: ['#0369A1', '#E0F2FE', '#7DD3FC', '#082F49'],
  teal: ['#115E59', '#CCFBF1', '#5EEAD4', '#042F2E'],
  green: ['#166534', '#DCFCE7', '#86EFAC', '#052E16'],
  amber: ['#92400E', '#FEF3C7', '#FCD34D', '#451A03'],
  orange: ['#9A3412', '#FFEDD5', '#FDBA74', '#431407'],
  red: ['#B91C1C', '#FEE2E2', '#FCA5A5', '#450A0A'],
  pink: ['#BE185D', '#FCE7F3', '#F9A8D4', '#500724'],
  violet: ['#6D28D9', '#EDE9FE', '#C4B5FD', '#2E1065'],
}

/**
 * Minimum OKLab distance between two inks of one mode. A just-noticeable difference is about 0.02.
 * Two legacy neighbours sit closest — orange and amber's light inks, 0.028 — and their values are
 * fixed, so every pair keeps 0.025; a pair with at least one of the fourteen newer colours keeps 0.045.
 */
const MIN_DISTANCE = 0.025
const MIN_DISTANCE_NEW = 0.045

/** The icons the planning kits use (viable-agent `KIT_ICONS`) — the catalogue must hold every one. */
const KIT_ICONS = [
  'circle', 'tag', 'layers', 'flag', 'target', 'star', 'briefcase', 'folder', 'book-open', 'file-text', 'sparkles',
  'lightbulb', 'rocket', 'bug', 'shield', 'square-check', 'list-checks', 'clipboard-list', 'funnel', 'trending-up',
  'handshake', 'building', 'contact', 'user-round', 'user-round-check', 'users', 'phone', 'mail', 'message-square',
  'megaphone', 'calendar', 'calendar-check', 'clock', 'headset', 'inbox', 'siren', 'warehouse', 'package', 'receipt',
  'truck', 'map', 'map-pin', 'wrench', 'workflow', 'send', 'stamp',
]

describe('@owlmeans/web-panel/picker/vocabulary — the palette', () => {
  test('24 unique keys in hue order; the ten legacy hues keep their exact values', () => {
    expect(PICKER_COLORS.map(color => color.key)).toEqual([...PICKER_COLOR_KEYS])
    expect(new Set(PICKER_COLOR_KEYS).size).toBe(24)
    expect(PICKER_COLOR_KEYS).toContain(PICKER_FALLBACK_COLOR)
    for (const [key, values] of Object.entries(LEGACY)) {
      const color = PICKER_COLORS.find(candidate => candidate.key === key)
      expect({ key, values: [color?.ink, color?.soft, color?.inkDark, color?.softDark] }).toEqual({ key, values })
    }
  })

  test('every ink keeps 4.5:1 on its ground and on the page, in both modes; every value is distinct', () => {
    for (const color of PICKER_COLORS) {
      const dark = { ink: color.inkDark ?? color.ink, soft: color.softDark ?? color.soft }
      const ratios = {
        key: color.key,
        onSoft: contrast(color.ink, color.soft) >= 4.5,
        onWhite: contrast(color.ink, '#FFFFFF') >= 4.5,
        onSoftDark: contrast(dark.ink, dark.soft) >= 4.5,
        onBlack: contrast(dark.ink, '#000000') >= 4.5,
      }
      expect(ratios).toEqual({ key: color.key, onSoft: true, onWhite: true, onSoftDark: true, onBlack: true })
    }
    const values = PICKER_COLORS.flatMap(color => [color.swatch, color.ink, color.soft, color.inkDark, color.softDark])
      .map(value => value?.toLowerCase())
    expect(values.every(value => value != null && /^#[0-9a-f]{6}$/.test(value))).toBe(true)
    expect(new Set(values).size).toBe(PICKER_COLORS.length * 5)
  })

  test('the inks of one mode stay apart in OKLab', () => {
    for (const mode of ['ink', 'inkDark'] as const) {
      for (let i = 0; i < PICKER_COLORS.length; i++) {
        for (let j = i + 1; j < PICKER_COLORS.length; j++) {
          const [a, b] = [PICKER_COLORS[i], PICKER_COLORS[j]]
          const legacy = a.key in LEGACY && b.key in LEGACY
          const apart = distance(a[mode] ?? a.ink, b[mode] ?? b.ink)
          expect({ mode, pair: `${a.key}/${b.key}`, apart: apart >= (legacy ? MIN_DISTANCE : MIN_DISTANCE_NEW) })
            .toEqual({ mode, pair: `${a.key}/${b.key}`, apart: true })
        }
      }
    }
  })
})

describe('@owlmeans/web-panel/picker/vocabulary — pickerColorHelper', () => {
  test('normalizes hex and resolves keys, hex and unknown values', () => {
    expect(pickerColorHelper.normalizeHex('#ABC')).toBe('#aabbcc')
    expect(pickerColorHelper.normalizeHex('abc')).toBe('#aabbcc')
    expect(pickerColorHelper.normalizeHex(' AABBCC ')).toBe('#aabbcc')
    expect(pickerColorHelper.normalizeHex('#abcd')).toBeNull()
    expect(pickerColorHelper.normalizeHex('blue')).toBeNull()
    expect(pickerColorHelper.isHex('#aBc')).toBe(true)
    expect(pickerColorHelper.isHex('aabbcc')).toBe(false)
    expect(pickerColorHelper.isHex(42)).toBe(false)

    expect(pickerColorHelper.resolve('blue')).toMatchObject({ key: 'blue', custom: false, label: 'Blue', inkDark: '#93C5FD' })
    expect(pickerColorHelper.resolve('#0F766E')).toMatchObject({ key: '#0f766e', custom: true, label: '#0F766E', swatch: '#0f766e' })
    expect(pickerColorHelper.resolve('abc')).toBeNull()
    expect(pickerColorHelper.resolve('nope')).toBeNull()
    expect(pickerColorHelper.resolve('')).toBeNull()
    expect(pickerColorHelper.resolve(null)).toBeNull()

    const statuses = [
      { key: 'neutral', swatch: 'var(--tone-neutral)', ink: 'var(--tone-neutral)', soft: 'var(--tone-neutral-soft)' },
      { key: 'info', swatch: 'var(--tone-info)', ink: 'var(--tone-info)', soft: 'var(--tone-info-soft)', label: 'In progress' },
    ]
    expect(pickerColorHelper.resolve('info', statuses)).toMatchObject({ label: 'In progress', inkDark: 'var(--tone-info)' })
    expect(pickerColorHelper.styleOf('unknown', statuses)['--pick-ink']).toBe('var(--tone-neutral)')
    expect(pickerColorHelper.styleOf('unknown')).toEqual({
      '--pick-swatch': '#64748B', '--pick-ink': '#334155', '--pick-soft': '#F1F5F9',
      '--pick-ink-dark': '#CBD5E1', '--pick-soft-dark': '#1E293B',
    })
    expect(pickerColorHelper.hashKey('card-42')).toBe(pickerColorHelper.hashKey('card-42'))
    expect(PICKER_COLOR_KEYS).toContain(pickerColorHelper.hashKey('card-42') as typeof PICKER_COLOR_KEYS[number])
    expect(new Set(Array.from({ length: 200 }, (_, n) => pickerColorHelper.hashKey(`seed-${n}`))).size).toBeGreaterThan(18)
  })

  test('a custom colour gets inks that keep 4.5:1 on its grounds and the page, in both modes', () => {
    let seed = 7
    const random = (): string => {
      seed = (seed * 1103515245 + 12345) % 2147483648

      return `#${(seed % 0x1000000).toString(16).padStart(6, '0')}`
    }
    const samples = [
      '#ffffff', '#000000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff0000', '#ff00ff', '#808080',
      '#3b82f6', '#fde047', '#0f766e', '#111827', '#f5f5f5', '#7f1d1d', ...Array.from({ length: 60 }, random),
    ]
    for (const hex of samples) {
      const color = pickerColorHelper.resolve(hex)
      expect(color?.custom).toBe(true)
      const safe = color != null
        && contrast(color.ink, color.soft) >= 4.5 && contrast(color.ink, '#ffffff') >= 4.5
        && contrast(color.inkDark, color.softDark) >= 4.5 && contrast(color.inkDark, '#000000') >= 4.5
      expect({ hex, safe }).toEqual({ hex, safe: true })
    }
  })
})

describe('@owlmeans/web-panel/picker/vocabulary — the icon catalogue', () => {
  test('entries and components name the same icons; kebab names, known categories, the kit icons included', () => {
    expect(Object.keys(PICKER_ICONS).sort()).toEqual([...PICKER_ICON_NAMES].sort())
    expect(new Set(PICKER_ICON_NAMES).size).toBe(PICKER_ICON_NAMES.length)
    expect(PICKER_ICON_NAMES.length).toBeGreaterThanOrEqual(200)
    expect(PICKER_ICON_NAMES.every(name => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name))).toBe(true)
    expect(PICKER_ICON_ENTRIES.every(entry => entry.keywords.length > 0)).toBe(true)
    for (const category of PICKER_ICON_CATEGORIES) {
      expect({ category, icons: PICKER_ICON_ENTRIES.filter(entry => entry.category === category).length >= 15 })
        .toEqual({ category, icons: true })
    }
    expect(KIT_ICONS.filter(name => !PICKER_ICON_NAMES.includes(name))).toEqual([])
    expect(PICKER_ICON_NAMES).toContain(PICKER_FALLBACK_ICON)
  })

  test('pickerIconHelper looks up, falls back and searches', () => {
    expect(pickerIconHelper.iconOf('rocket')).toBe(PICKER_ICONS.rocket)
    expect(pickerIconHelper.iconOf('no-such-icon')).toBe(PICKER_ICONS[PICKER_FALLBACK_ICON])
    expect(pickerIconHelper.iconOf(null)).toBe(PICKER_ICONS[PICKER_FALLBACK_ICON])
    expect(pickerIconHelper.has('truck')).toBe(true)
    expect(pickerIconHelper.has('toString')).toBe(false)

    expect(pickerIconHelper.search('').length).toBe(PICKER_ICON_NAMES.length)
    expect(pickerIconHelper.search('Rocket')[0]?.name).toBe('rocket')
    expect(pickerIconHelper.search('hand').map(entry => entry.name).slice(0, 2)).toEqual(['hand', 'handshake'])
    expect(pickerIconHelper.search('deal').map(entry => entry.name)).toContain('handshake')
    expect(pickerIconHelper.search('user check').map(entry => entry.name)).toContain('user-round-check')
    expect(pickerIconHelper.search('zzzz')).toEqual([])
    expect(pickerIconHelper.search('', ['truck', 'nope', 'bug']).map(entry => entry.name)).toEqual(['truck', 'bug'])
    expect(pickerIconHelper.byCategory('places').every(entry => entry.category === 'places')).toBe(true)
  })

  test('the vocabulary imports nothing outside the picker — no React, no icon set', () => {
    const roots = [join(import.meta.dir, '../src/picker'), join(import.meta.dir, '../src/picker/vocabulary'),
      join(import.meta.dir, '../src/picker/utils'), join(import.meta.dir, '../src/picker/utils/color')]
    const files = [
      join(roots[0], 'vocabulary.ts'), join(roots[2], 'color.ts'),
      ...readdirSync(roots[1]).map(file => join(roots[1], file)), ...readdirSync(roots[3]).map(file => join(roots[3], file)),
    ]
    for (const file of files) {
      const specifiers = [...readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
      expect({ file, outside: specifiers.filter(specifier => !specifier.startsWith('.')) }).toEqual({ file, outside: [] })
    }
  })
})
